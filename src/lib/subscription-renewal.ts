import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders, subscriptionItems, subscriptions } from "@/db/schema";
import { generateOrderNumber } from "@/lib/order-number";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";
import { submitStripeOrderToCoreSystem } from "@/lib/core-system-sync";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import { resolveOrderCostSnapshot, type OrderCostSnapshot } from "@/lib/order-cost-snapshot";
import { getProductById } from "@/lib/products";
import type { Address, ShippingAddress, SubscriptionInterval } from "@/lib/types";

/** OrderCostSnapshot(snake_case)を、ordersテーブルのinsert用カラム(camelCase)へ変換する。 */
function costSnapshotToInsertFields(snap: OrderCostSnapshot) {
  return {
    costAmount: snap.cost_amount,
    bundleInsertCost: snap.bundle_insert_cost,
    shippingCost: snap.shipping_cost,
    salesCommissionAmount: snap.sales_commission_amount,
    taxRate: snap.tax_rate !== null ? String(snap.tax_rate) : null,
  };
}

/**
 * 定期購入(Stripe決済)の2回目以降の周期課金(invoice.paid, billing_reason=subscription_cycle)を
 * 受けて、チャットシステム内に今回分の注文データを生成する。
 * スマレジへの連携は行わないが、他の注文と同様に基幹システムへは取り込む。
 * 同一invoiceでWebhookが複数回届いても、既に生成済みなら何もしない。
 */
export async function createSubscriptionRenewalOrder(params: {
  stripeSubscriptionId: string;
  invoiceId: string;
}): Promise<void> {
  try {
    const db = await getDb();

    const [existing] = await db.select({ id: orders.id }).from(orders).where(eq(orders.stripePaymentIntentId, params.invoiceId)).limit(1);
    if (existing) return;

    const [original] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.stripeSubscriptionId, params.stripeSubscriptionId), isNull(orders.parentOrderId)))
      .limit(1);
    if (!original) return;

    const [latestChild] = await db
      .select({ billingCycleNumber: orders.billingCycleNumber })
      .from(orders)
      .where(eq(orders.parentOrderId, original.id))
      .orderBy(desc(orders.billingCycleNumber))
      .limit(1);
    const nextCycleNumber = (latestChild?.billingCycleNumber ?? original.billingCycleNumber ?? 1) + 1;

    // お試し→本品自動切替プランの場合、2回目以降はStripe側のSubscription Scheduleが
    // 既に本品の価格を自動課金している。チャット側の注文記録もそれに合わせて、
    // 元の品番(root)に設定された本品(next_cycle_product_id)を都度確認して反映する
    // (通常の定期は設定が無いため、従来通りoriginalをそのまま使う)。
    const rootProduct = await getProductById(original.productId);
    const nextCycleProductId = rootProduct?.next_cycle_product_id ?? null;
    const productId = nextCycleProductId ?? original.productId;
    const isProductSwitched = productId !== original.productId;
    const nextCycleProduct = isProductSwitched ? await getProductById(productId) : null;
    const amount = isProductSwitched && nextCycleProduct ? nextCycleProduct.price * original.quantity : original.amount;
    const shippingFee = isProductSwitched && nextCycleProduct ? nextCycleProduct.shipping_fee : original.shippingFee;
    // 原価・費用・税率は、商品が切り替わっていなければ初回注文時点のスナップショットを
    // そのまま引き継ぎ、切り替わっている場合のみ本品の現在の設定から都度解決する。
    const costSnapshot: OrderCostSnapshot = isProductSwitched
      ? await resolveOrderCostSnapshot(db, productId, new Date().toISOString())
      : {
          cost_amount: original.costAmount ?? 0,
          bundle_insert_cost: original.bundleInsertCost ?? 0,
          shipping_cost: original.shippingCost ?? 0,
          sales_commission_amount: original.salesCommissionAmount ?? 0,
          tax_rate: original.taxRate !== null ? Number(original.taxRate) : null,
        };

    const orderNumber = await generateOrderNumber(db, original.scenarioId);

    const [newOrder] = await db
      .insert(orders)
      .values({
        customerId: original.customerId,
        productId,
        scenarioId: original.scenarioId,
        orderNumber,
        sessionId: original.sessionId,
        type: "subscription",
        paymentMethod: "stripe",
        amount,
        quantity: original.quantity,
        shippingFee,
        paymentFee: original.paymentFee,
        ...costSnapshotToInsertFields(costSnapshot),
        status: "paid",
        // Stripe注文はフルフィル担当が基幹システムへ手動で取り込むため、未取込みのまま生成する
        stripeSubscriptionId: params.stripeSubscriptionId,
        stripePaymentIntentId: params.invoiceId,
        deliveryDate: original.deliveryDate,
        deliveryTimeSlot: original.deliveryTimeSlot,
        agreedTermsAt: original.agreedTermsAt,
        shippingAddress: original.shippingAddress,
        // よりどり(セット品)の内訳選択は、定期継続中は初回と同じ内容を引き継ぐ。
        setSelections: original.setSelections,
        parentOrderId: original.id,
        billingCycleNumber: nextCycleNumber,
        // アドオンが定期便として同時申込されている場合のみ、2回目以降の注文にも引き継ぐ
        // (単発アドオンは初回のみの一括請求だったため、従来通りここではコピーしない)。
        ...(original.isAddonSubscription && {
          addonProductId: original.addonProductId,
          addonAmount: original.addonAmount,
          isAddonSubscription: true,
        }),
      })
      .returning({ id: orders.id });

    await sendOrderCompletionEmail(newOrder.id);
    await submitStripeOrderToCoreSystem(newOrder.id);
  } catch (err) {
    console.error("[subscription-renewal] unexpected error", { params, err });
  }
}

/**
 * 代引き・後払いの定期購入について、次回お届け予定日が近づいた注文データを
 * チャットシステム側で新規生成する(/api/cron/subscription-renewalsから呼ばれる)。
 * スマレジ連携は廃止したため、Stripe注文の定期継続分と同様、生成した注文データは
 * スタッフが通販ゲートCSV書き出し・出荷報告CSV取込で進めていく(import_statusは
 * デフォルト(not_imported)のまま生成する)。
 * 与信判定は基幹システム側(coreSystem.submitOrder)が毎回の受注データ生成時に行う運用のため、
 * チャットシステム側では判定結果を受け取るだけでよい。
 */
export async function createDeferredSubscriptionRenewalOrder(subscriptionRowId: string): Promise<void> {
  const db = await getDb();
  try {
    const [subscriptionRow] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionRowId)).limit(1);
    if (!subscriptionRow || subscriptionRow.status !== "active" || !subscriptionRow.nextBillingDate) return;

    const [original] = await db.select().from(orders).where(eq(orders.id, subscriptionRow.orderId)).limit(1);
    if (!original) return;

    const [latestChild] = await db
      .select({ billingCycleNumber: orders.billingCycleNumber })
      .from(orders)
      .where(eq(orders.parentOrderId, original.id))
      .orderBy(desc(orders.billingCycleNumber))
      .limit(1);
    const nextCycleNumber = (latestChild?.billingCycleNumber ?? original.billingCycleNumber ?? 1) + 1;

    // 同じ周期の注文が既に生成済みであれば何もしない(Cronの多重実行対策)。
    const [existing] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.parentOrderId, original.id), eq(orders.billingCycleNumber, nextCycleNumber)))
      .limit(1);
    if (existing) return;

    // 2回目以降は常に通常価格(初回特別価格・クーポンは初回のみ適用)。
    // 商品マスタの現在値ではなく、初回注文時点のスナップショット(original.amount等)を使う
    // (配信後にマスタ価格を変更しても、既存の定期購入者には反映されず、変更以後の新規受注にのみ
    // 反映されるようにするため)。ただし優先順位は、①顧客管理画面でスタッフが個別に上書き設定した
    // 場合(subscriptionsのoverride列)、②お試し→本品自動切替プランの設定(products.next_cycle_*)、
    // ③初回注文のスナップショット、の順(初回注文自体の記録は書き換えない)。
    const rootProduct = await getProductById(original.productId);
    const overrideProductId = subscriptionRow.overrideProductId;
    const autoSwitchProductId = !overrideProductId ? (rootProduct?.next_cycle_product_id ?? null) : null;
    const productId = overrideProductId ?? autoSwitchProductId ?? original.productId;
    const autoSwitchProduct = autoSwitchProductId ? await getProductById(autoSwitchProductId) : null;
    const quantity = subscriptionRow.overrideQuantity ?? original.quantity;
    const amount = subscriptionRow.overrideAmount ?? (autoSwitchProduct ? autoSwitchProduct.price * quantity : original.amount);
    const shippingFee =
      subscriptionRow.overrideShippingFee ?? (autoSwitchProduct ? autoSwitchProduct.shipping_fee : original.shippingFee);
    const paymentFee = subscriptionRow.overridePaymentFee ?? original.paymentFee;
    const paymentMethod = subscriptionRow.overridePaymentMethod ?? original.paymentMethod;
    const deliveryDate = subscriptionRow.nextBillingDate;
    // 自動切替プランで頻度も指定されていれば、次回以降はその頻度に切り替える。
    const effectiveInterval: SubscriptionInterval =
      autoSwitchProduct && rootProduct?.next_cycle_interval
        ? rootProduct.next_cycle_interval
        : (subscriptionRow.interval as SubscriptionInterval);

    const orderNumber = await generateOrderNumber(db, original.scenarioId);
    // 商品自体が上書きされている可能性があるため、原価・費用・税率は初回注文の値を
    // そのまま引き継がず、実際に出荷する商品(productId)の現在の設定から都度解決する
    // (amount/shippingFee/paymentFeeと同じくoverride列を優先するのと同じ考え方)。
    const costSnapshot = await resolveOrderCostSnapshot(db, productId, deliveryDate);
    const [newOrder] = await db
      .insert(orders)
      .values({
        customerId: original.customerId,
        productId,
        scenarioId: original.scenarioId,
        orderNumber,
        sessionId: original.sessionId,
        type: "subscription",
        paymentMethod,
        amount,
        quantity,
        shippingFee,
        paymentFee,
        ...costSnapshotToInsertFields(costSnapshot),
        status: "pending",
        deliveryDate,
        deliveryTimeSlot: original.deliveryTimeSlot,
        invoiceNote: original.invoiceNote,
        agreedTermsAt: original.agreedTermsAt,
        shippingAddress: original.shippingAddress,
        // よりどり(セット品)の内訳選択は、定期継続中は初回と同じ内容を引き継ぐ。
        setSelections: original.setSelections,
        parentOrderId: original.id,
        billingCycleNumber: nextCycleNumber,
        // アドオンが定期便として同時申込されている場合のみ、2回目以降の注文にも引き継ぐ
        // (単発アドオンは初回のみの一括購入だったため、従来通りここではコピーしない)。
        ...(original.isAddonSubscription && {
          addonProductId: original.addonProductId,
          addonAmount: original.addonAmount,
          isAddonSubscription: true,
        }),
      })
      .returning({ id: orders.id });

    // 受注データの生成に成功した時点で、後続処理(与信・スマレジ連携)の成否に関わらず
    // 次回の予定日を進める(1周期分の失敗で以後のスケジュールが止まらないようにするため)。
    // 自動切替で頻度が変わった場合は、以後この新しい頻度で定期購読を進める。
    const nextDate = new Date(deliveryDate);
    nextDate.setDate(nextDate.getDate() + SUBSCRIPTION_INTERVAL_DAYS[effectiveInterval]);
    await db
      .update(subscriptions)
      .set({ nextBillingDate: nextDate.toISOString().slice(0, 10), interval: effectiveInterval })
      .where(eq(subscriptions.id, subscriptionRowId));

    const [customer] = await db
      .select({ name: customers.name, email: customers.email, phone: customers.phone, address: customers.address })
      .from(customers)
      .where(eq(customers.id, original.customerId))
      .limit(1);
    if (!customer) return;

    const coreSystem = getCoreSystemAdapter();
    const { accepted } = await coreSystem.submitOrder({
      orderId: newOrder.id,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address as Address,
      },
      orderType: "subscription",
      paymentMethod: paymentMethod as "cod" | "deferred_invoice",
      product: { id: productId, quantity },
      amount,
      shippingFee,
      paymentFee,
      addonProduct:
        original.isAddonSubscription && original.addonProductId
          ? { id: original.addonProductId, amount: original.addonAmount ?? 0 }
          : undefined,
      shippingAddress: (original.shippingAddress as ShippingAddress | null) ?? undefined,
    });

    const newStatus = accepted ? "accepted" : "failed";
    await db.update(orders).set({ status: newStatus }).where(eq(orders.id, newOrder.id));

    // 定期プランに後から追加された商品(同梱設定)を、本体と同じ配送日・同じ周期番号で
    // 追加の注文行として生成する(送料・手数料は本体側にのみ計上するため0円)。
    const bundledItems = await db
      .select({ id: subscriptionItems.id, productId: subscriptionItems.productId, quantity: subscriptionItems.quantity, unitAmount: subscriptionItems.unitAmount })
      .from(subscriptionItems)
      .where(and(eq(subscriptionItems.subscriptionId, subscriptionRowId), isNull(subscriptionItems.removedAt)));

    for (const item of bundledItems) {
      const itemOrderNumber = await generateOrderNumber(db, original.scenarioId);
      const itemCostSnapshot = await resolveOrderCostSnapshot(db, item.productId, deliveryDate);
      await db.insert(orders).values({
        customerId: original.customerId,
        productId: item.productId,
        scenarioId: original.scenarioId,
        orderNumber: itemOrderNumber,
        type: "subscription",
        paymentMethod,
        amount: item.unitAmount * item.quantity,
        quantity: item.quantity,
        shippingFee: 0,
        paymentFee: 0,
        ...costSnapshotToInsertFields(itemCostSnapshot),
        status: newStatus,
        deliveryDate,
        deliveryTimeSlot: original.deliveryTimeSlot,
        agreedTermsAt: original.agreedTermsAt,
        shippingAddress: original.shippingAddress,
        parentOrderId: original.id,
        billingCycleNumber: nextCycleNumber,
        subscriptionItemId: item.id,
      });
    }

    if (accepted) {
      await sendOrderCompletionEmail(newOrder.id);
    }
  } catch (err) {
    console.error("[subscription-renewal] unexpected error (deferred)", { subscriptionRowId, err });
  }
}
