import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateOrderNumber } from "@/lib/order-number";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";
import { submitStripeOrderToCoreSystem } from "@/lib/core-system-sync";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import { resolveOrderCostSnapshot } from "@/lib/order-cost-snapshot";
import { getProductById } from "@/lib/products";
import type { Address, SubscriptionInterval } from "@/lib/types";

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
    const supabase = createSupabaseAdminClient();

    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", params.invoiceId)
      .maybeSingle();
    if (existing) return;

    const { data: original } = await supabase
      .from("orders")
      .select("*")
      .eq("stripe_subscription_id", params.stripeSubscriptionId)
      .is("parent_order_id", null)
      .maybeSingle();
    if (!original) return;

    const { data: latestChild } = await supabase
      .from("orders")
      .select("billing_cycle_number")
      .eq("parent_order_id", original.id)
      .order("billing_cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextCycleNumber = (latestChild?.billing_cycle_number ?? original.billing_cycle_number ?? 1) + 1;

    // お試し→本品自動切替プランの場合、2回目以降はStripe側のSubscription Scheduleが
    // 既に本品の価格を自動課金している。チャット側の注文記録もそれに合わせて、
    // 元の品番(root)に設定された本品(next_cycle_product_id)を都度確認して反映する
    // (通常の定期は設定が無いため、従来通りoriginalをそのまま使う)。
    const rootProduct = await getProductById(original.product_id);
    const nextCycleProductId = rootProduct?.next_cycle_product_id ?? null;
    const productId = nextCycleProductId ?? original.product_id;
    const isProductSwitched = productId !== original.product_id;
    const nextCycleProduct = isProductSwitched ? await getProductById(productId) : null;
    const amount = isProductSwitched && nextCycleProduct ? nextCycleProduct.price * original.quantity : original.amount;
    const shippingFee =
      isProductSwitched && nextCycleProduct ? nextCycleProduct.shipping_fee : original.shipping_fee;
    // 原価・費用・税率は、商品が切り替わっていなければ初回注文時点のスナップショットを
    // そのまま引き継ぎ、切り替わっている場合のみ本品の現在の設定から都度解決する。
    const costSnapshot = isProductSwitched
      ? await resolveOrderCostSnapshot(supabase, productId, new Date().toISOString())
      : {
          cost_amount: original.cost_amount,
          bundle_insert_cost: original.bundle_insert_cost,
          shipping_cost: original.shipping_cost,
          sales_commission_amount: original.sales_commission_amount,
          tax_rate: original.tax_rate,
        };

    const orderNumber = await generateOrderNumber(supabase, original.scenario_id);

    const { data: newOrder, error } = await supabase
      .from("orders")
      .insert({
        customer_id: original.customer_id,
        product_id: productId,
        scenario_id: original.scenario_id,
        order_number: orderNumber,
        session_id: original.session_id,
        type: "subscription",
        payment_method: "stripe",
        amount,
        quantity: original.quantity,
        shipping_fee: shippingFee,
        payment_fee: original.payment_fee,
        ...costSnapshot,
        status: "paid",
        // Stripe注文はフルフィル担当が基幹システムへ手動で取り込むため、未取込みのまま生成する
        stripe_subscription_id: params.stripeSubscriptionId,
        stripe_payment_intent_id: params.invoiceId,
        delivery_date: original.delivery_date,
        delivery_time_slot: original.delivery_time_slot,
        agreed_terms_at: original.agreed_terms_at,
        shipping_address: original.shipping_address,
        // よりどり(セット品)の内訳選択は、定期継続中は初回と同じ内容を引き継ぐ。
        set_selections: original.set_selections,
        parent_order_id: original.id,
        billing_cycle_number: nextCycleNumber,
        // アドオンが定期便として同時申込されている場合のみ、2回目以降の注文にも引き継ぐ
        // (単発アドオンは初回のみの一括請求だったため、従来通りここではコピーしない)。
        ...(original.is_addon_subscription && {
          addon_product_id: original.addon_product_id,
          addon_amount: original.addon_amount,
          is_addon_subscription: true,
        }),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[subscription-renewal] failed to create renewal order", error);
      return;
    }

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
  const supabase = createSupabaseAdminClient();
  try {
    const { data: subscriptionRow } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionRowId)
      .maybeSingle();
    if (!subscriptionRow || subscriptionRow.status !== "active" || !subscriptionRow.next_billing_date) return;

    const { data: original } = await supabase
      .from("orders")
      .select("*")
      .eq("id", subscriptionRow.order_id)
      .maybeSingle();
    if (!original) return;

    const { data: latestChild } = await supabase
      .from("orders")
      .select("billing_cycle_number")
      .eq("parent_order_id", original.id)
      .order("billing_cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextCycleNumber = (latestChild?.billing_cycle_number ?? original.billing_cycle_number ?? 1) + 1;

    // 同じ周期の注文が既に生成済みであれば何もしない(Cronの多重実行対策)。
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("parent_order_id", original.id)
      .eq("billing_cycle_number", nextCycleNumber)
      .maybeSingle();
    if (existing) return;

    // 2回目以降は常に通常価格(初回特別価格・クーポンは初回のみ適用)。
    // 商品マスタの現在値ではなく、初回注文時点のスナップショット(original.amount等)を使う
    // (配信後にマスタ価格を変更しても、既存の定期購入者には反映されず、変更以後の新規受注にのみ
    // 反映されるようにするため)。ただし優先順位は、①顧客管理画面でスタッフが個別に上書き設定した
    // 場合(subscriptionsのoverride列)、②お試し→本品自動切替プランの設定(products.next_cycle_*)、
    // ③初回注文のスナップショット、の順(初回注文自体の記録は書き換えない)。
    const rootProduct = await getProductById(original.product_id);
    const overrideProductId = subscriptionRow.override_product_id as string | null;
    const autoSwitchProductId = !overrideProductId ? (rootProduct?.next_cycle_product_id ?? null) : null;
    const productId = overrideProductId ?? autoSwitchProductId ?? original.product_id;
    const autoSwitchProduct = autoSwitchProductId ? await getProductById(autoSwitchProductId) : null;
    const quantity = (subscriptionRow.override_quantity as number | null) ?? (original.quantity as number);
    const amount =
      (subscriptionRow.override_amount as number | null) ??
      (autoSwitchProduct ? autoSwitchProduct.price * quantity : (original.amount as number));
    const shippingFee =
      (subscriptionRow.override_shipping_fee as number | null) ??
      (autoSwitchProduct ? autoSwitchProduct.shipping_fee : (original.shipping_fee as number));
    const paymentFee = (subscriptionRow.override_payment_fee as number | null) ?? (original.payment_fee as number);
    const paymentMethod = (subscriptionRow.override_payment_method as string | null) ?? original.payment_method;
    const deliveryDate = subscriptionRow.next_billing_date as string;
    // 自動切替プランで頻度も指定されていれば、次回以降はその頻度に切り替える。
    const effectiveInterval: SubscriptionInterval =
      autoSwitchProduct && rootProduct?.next_cycle_interval
        ? rootProduct.next_cycle_interval
        : (subscriptionRow.interval as SubscriptionInterval);

    const orderNumber = await generateOrderNumber(supabase, original.scenario_id);
    // 商品自体が上書きされている可能性があるため、原価・費用・税率は初回注文の値を
    // そのまま引き継がず、実際に出荷する商品(productId)の現在の設定から都度解決する
    // (amount/shippingFee/paymentFeeと同じくoverride列を優先するのと同じ考え方)。
    const costSnapshot = await resolveOrderCostSnapshot(supabase, productId, deliveryDate);
    const { data: newOrder, error } = await supabase
      .from("orders")
      .insert({
        customer_id: original.customer_id,
        product_id: productId,
        scenario_id: original.scenario_id,
        order_number: orderNumber,
        session_id: original.session_id,
        type: "subscription",
        payment_method: paymentMethod,
        amount,
        quantity,
        shipping_fee: shippingFee,
        payment_fee: paymentFee,
        ...costSnapshot,
        status: "pending",
        delivery_date: deliveryDate,
        delivery_time_slot: original.delivery_time_slot,
        invoice_note: original.invoice_note,
        agreed_terms_at: original.agreed_terms_at,
        shipping_address: original.shipping_address,
        // よりどり(セット品)の内訳選択は、定期継続中は初回と同じ内容を引き継ぐ。
        set_selections: original.set_selections,
        parent_order_id: original.id,
        billing_cycle_number: nextCycleNumber,
        // アドオンが定期便として同時申込されている場合のみ、2回目以降の注文にも引き継ぐ
        // (単発アドオンは初回のみの一括購入だったため、従来通りここではコピーしない)。
        ...(original.is_addon_subscription && {
          addon_product_id: original.addon_product_id,
          addon_amount: original.addon_amount,
          is_addon_subscription: true,
        }),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[subscription-renewal] failed to create deferred renewal order", error);
      return;
    }

    // 受注データの生成に成功した時点で、後続処理(与信・スマレジ連携)の成否に関わらず
    // 次回の予定日を進める(1周期分の失敗で以後のスケジュールが止まらないようにするため)。
    // 自動切替で頻度が変わった場合は、以後この新しい頻度で定期購読を進める。
    const nextDate = new Date(deliveryDate);
    nextDate.setDate(nextDate.getDate() + SUBSCRIPTION_INTERVAL_DAYS[effectiveInterval]);
    await supabase
      .from("subscriptions")
      .update({ next_billing_date: nextDate.toISOString().slice(0, 10), interval: effectiveInterval })
      .eq("id", subscriptionRowId);

    const { data: customer } = await supabase
      .from("customers")
      .select("name, email, phone, address")
      .eq("id", original.customer_id)
      .maybeSingle();
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
        original.is_addon_subscription && original.addon_product_id
          ? { id: original.addon_product_id, amount: original.addon_amount ?? 0 }
          : undefined,
      shippingAddress: original.shipping_address ?? undefined,
    });

    const newStatus = accepted ? "accepted" : "failed";
    await supabase.from("orders").update({ status: newStatus }).eq("id", newOrder.id);

    // 定期プランに後から追加された商品(同梱設定)を、本体と同じ配送日・同じ周期番号で
    // 追加の注文行として生成する(送料・手数料は本体側にのみ計上するため0円)。
    const { data: bundledItems } = await supabase
      .from("subscription_items")
      .select("id, product_id, quantity, unit_amount")
      .eq("subscription_id", subscriptionRowId)
      .is("removed_at", null);

    for (const item of bundledItems ?? []) {
      const itemOrderNumber = await generateOrderNumber(supabase, original.scenario_id);
      const itemCostSnapshot = await resolveOrderCostSnapshot(supabase, item.product_id, deliveryDate);
      await supabase.from("orders").insert({
        customer_id: original.customer_id,
        product_id: item.product_id,
        scenario_id: original.scenario_id,
        order_number: itemOrderNumber,
        type: "subscription",
        payment_method: paymentMethod,
        amount: item.unit_amount * item.quantity,
        quantity: item.quantity,
        shipping_fee: 0,
        payment_fee: 0,
        ...itemCostSnapshot,
        status: newStatus,
        delivery_date: deliveryDate,
        delivery_time_slot: original.delivery_time_slot,
        agreed_terms_at: original.agreed_terms_at,
        shipping_address: original.shipping_address,
        parent_order_id: original.id,
        billing_cycle_number: nextCycleNumber,
        subscription_item_id: item.id,
      });
    }

    if (accepted) {
      await sendOrderCompletionEmail(newOrder.id);
    }
  } catch (err) {
    console.error("[subscription-renewal] unexpected error (deferred)", { subscriptionRowId, err });
  }
}
