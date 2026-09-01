import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { orders, subscriptions } from "@/db/schema";
import { requireAdminRole } from "@/lib/require-role";
import { shippingAddressSchema, subscriptionIntervalSchema } from "@/lib/checkout-schema";
import { SUBSCRIPTION_INTERVAL_STRIPE_MAP, SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import { getProductById } from "@/lib/products";
import { getPaymentFee } from "@/lib/fees";
import { diffFields, recordChangeLog } from "@/lib/customer-change-log";
import { createDeferredSubscriptionRenewalOrder } from "@/lib/subscription-renewal";
import type { PaymentMethod } from "@/lib/types";

const contentOverrideSchema = z.object({
  productId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).optional(),
  amount: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["cod", "deferred_invoice"]).optional(),
  // 代引き・後払いの頻度変更(Stripeと違いAPI呼び出し不要のため、subscriptions.intervalを直接更新する)。
  interval: subscriptionIntervalSchema.optional(),
});

const updateSchema = z.object({
  shippingAddress: shippingAddressSchema.nullable().optional(),
  deliveryDate: z.string().optional(),
  deliveryTimeSlot: z.string().optional(),
  subscriptionInterval: subscriptionIntervalSchema.optional(),
  cancelSubscription: z.boolean().optional(),
  resumeSubscription: z.object({ nextBillingDate: z.string().min(1) }).optional(),
  skipNextCycle: z.boolean().optional(),
  generateNow: z.boolean().optional(),
  contentOverride: contentOverrideSchema.optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 定期便申込データの変更(顧客管理画面①③)をadmin権限で行う。
 * お届け先・お届け頻度の変更は、この(定期の親)注文に対して行うことで、以降の定期継続分
 * (createDeferredSubscriptionRenewalOrderがこの注文を元に生成するもの)にも自動的に反映される。
 * 頻度変更・解約はStripe決済の定期購入も対応するが、商品/金額/決済方法の変更・再開・スキップは
 * Stripeでは対応しない(途中からの内容変更はお客様に再度注文いただく方針のため)。
 * 代引き・後払いの商品/数量/2回目以降価格/決済方法の変更は、初回注文自体の記録を書き換えず
 * subscriptionsのoverride列に保存し、次回受注生成時にそちらを優先して使う。
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const db = await getDb();
  let order;
  try {
    [order] = await db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        type: orders.type,
        paymentMethod: orders.paymentMethod,
        amount: orders.amount,
        shippingFee: orders.shippingFee,
        paymentFee: orders.paymentFee,
        addonAmount: orders.addonAmount,
        isAddonSubscription: orders.isAddonSubscription,
        stripeSubscriptionId: orders.stripeSubscriptionId,
        parentOrderId: orders.parentOrderId,
      })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.parentOrderId) {
    return NextResponse.json(
      { error: "定期の親注文(初回)に対してのみ変更できます" },
      { status: 400 },
    );
  }

  const isStripeSubscription = order.type === "subscription" && order.paymentMethod === "stripe";
  const changedByEmail = roleCheck.user.email;

  const orderUpdate: Record<string, unknown> = {};
  if (input.shippingAddress !== undefined) orderUpdate.shippingAddress = input.shippingAddress;
  if (input.deliveryDate !== undefined) orderUpdate.deliveryDate = input.deliveryDate || null;
  if (input.deliveryTimeSlot !== undefined) orderUpdate.deliveryTimeSlot = input.deliveryTimeSlot || null;

  if (Object.keys(orderUpdate).length > 0) {
    try {
      await db.update(orders).set(orderUpdate).where(eq(orders.id, id));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    if (input.shippingAddress !== undefined) {
      await recordChangeLog(db, {
        customerId: order.customerId,
        subscriptionId: null,
        action: "shipping_address_update",
        changes: diffFields([
          { field: "shippingAddress", label: "お届け先", before: null, after: input.shippingAddress },
        ]),
        changedByEmail,
      });
    }
  }

  if (input.subscriptionInterval !== undefined) {
    if (!isStripeSubscription || !order.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "Stripeの定期購入以外はこのAPIでの頻度変更に対応していません" },
        { status: 400 },
      );
    }
    try {
      const stripe = getStripeClient();
      const subscription = await stripe.subscriptions.retrieve(order.stripeSubscriptionId);
      const items = subscription.items.data;
      if (items.length === 0) throw new Error("subscription item not found");

      const { interval, intervalCount } = SUBSCRIPTION_INTERVAL_STRIPE_MAP[input.subscriptionInterval];
      const mainUnitAmount = order.amount + order.shippingFee + order.paymentFee;
      // アドオンも定期便として同時申込されている場合、メインとは別のPrice/itemとして
      // 同一Subscription内に存在するため、そちらも新しい頻度のPriceへ差し替える。
      const addonUnitAmount = order.isAddonSubscription ? (order.addonAmount ?? 0) : null;

      const mainItem = items.find((i) => i.price.unit_amount === mainUnitAmount) ?? items[0];
      const newMainPrice = await stripe.prices.create({
        currency: "jpy",
        unit_amount: mainUnitAmount,
        recurring: { interval, interval_count: intervalCount },
        product_data: { name: `定期便(頻度変更: ${input.subscriptionInterval})` },
      });
      const subscriptionItems: { id: string; price: string }[] = [{ id: mainItem.id, price: newMainPrice.id }];

      if (addonUnitAmount !== null) {
        const addonItem = items.find((i) => i.id !== mainItem.id);
        if (addonItem) {
          const newAddonPrice = await stripe.prices.create({
            currency: "jpy",
            unit_amount: addonUnitAmount,
            recurring: { interval, interval_count: intervalCount },
            product_data: { name: `定期便アドオン(頻度変更: ${input.subscriptionInterval})` },
          });
          subscriptionItems.push({ id: addonItem.id, price: newAddonPrice.id });
        }
      }

      await stripe.subscriptions.update(order.stripeSubscriptionId, {
        items: subscriptionItems,
        proration_behavior: "none",
      });

      await db
        .update(subscriptions)
        .set({ interval: input.subscriptionInterval })
        .where(eq(subscriptions.orderId, order.id));
    } catch (err) {
      console.error("[orders/edit] failed to update subscription interval", { orderId: id, err });
      return NextResponse.json({ error: "Stripeでの頻度変更に失敗しました" }, { status: 500 });
    }
  }

  if (input.cancelSubscription) {
    if (order.type !== "subscription") {
      return NextResponse.json({ error: "定期購入の注文ではありません" }, { status: 400 });
    }
    if (isStripeSubscription) {
      if (!order.stripeSubscriptionId) {
        return NextResponse.json(
          { error: "Stripeのサブスクリプション情報が見つかりません" },
          { status: 400 },
        );
      }
      try {
        const stripe = getStripeClient();
        await stripe.subscriptions.cancel(order.stripeSubscriptionId);
      } catch (err) {
        console.error("[orders/edit] failed to cancel subscription", { orderId: id, err });
        return NextResponse.json({ error: "Stripeでの解約処理に失敗しました" }, { status: 500 });
      }
    }
    try {
      await db.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.orderId, order.id));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    await recordChangeLog(db, {
      customerId: order.customerId,
      action: "subscription_cancel",
      changes: diffFields([{ field: "status", label: "状態", before: "継続中", after: "解約済み" }]),
      changedByEmail,
    });
  }

  // Stripeの定期は途中からの内容変更・再開・スキップに対応しない
  // (途中からの商品変更はお客様に再度注文いただく方針、再開は決済情報の再取得が必要なため)。
  if ((input.resumeSubscription || input.skipNextCycle || input.contentOverride) && isStripeSubscription) {
    return NextResponse.json(
      { error: "Stripeの定期購入は、内容変更・再開・スキップに対応していません(解約のみ対応)" },
      { status: 400 },
    );
  }

  if (input.contentOverride) {
    if (order.type !== "subscription") {
      return NextResponse.json({ error: "定期購入の注文ではありません" }, { status: 400 });
    }
    let subscriptionRow;
    try {
      [subscriptionRow] = await db
        .select({
          id: subscriptions.id,
          interval: subscriptions.interval,
          overrideProductId: subscriptions.overrideProductId,
          overrideQuantity: subscriptions.overrideQuantity,
          overrideAmount: subscriptions.overrideAmount,
          overridePaymentMethod: subscriptions.overridePaymentMethod,
        })
        .from(subscriptions)
        .where(eq(subscriptions.orderId, order.id))
        .limit(1);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    if (!subscriptionRow) return NextResponse.json({ error: "subscription not found" }, { status: 404 });

    const effectivePaymentMethod =
      input.contentOverride.paymentMethod ?? subscriptionRow.overridePaymentMethod ?? order.paymentMethod;
    const effectiveProductId = input.contentOverride.productId;

    let newShippingFee: number | undefined;
    let newPaymentFee: number | undefined;
    if (effectiveProductId) {
      const product = await getProductById(effectiveProductId);
      if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });
      newShippingFee = product.shipping_fee;
    }
    if (input.contentOverride.paymentMethod || effectiveProductId) {
      newPaymentFee = await getPaymentFee(effectivePaymentMethod as PaymentMethod, "subscription");
    }

    const subscriptionUpdate: Record<string, unknown> = {};
    if (input.contentOverride.productId !== undefined) subscriptionUpdate.overrideProductId = input.contentOverride.productId;
    if (input.contentOverride.quantity !== undefined) subscriptionUpdate.overrideQuantity = input.contentOverride.quantity;
    if (input.contentOverride.amount !== undefined) subscriptionUpdate.overrideAmount = input.contentOverride.amount;
    if (input.contentOverride.paymentMethod !== undefined) subscriptionUpdate.overridePaymentMethod = input.contentOverride.paymentMethod;
    if (input.contentOverride.interval !== undefined) subscriptionUpdate.interval = input.contentOverride.interval;
    if (newShippingFee !== undefined) subscriptionUpdate.overrideShippingFee = newShippingFee;
    if (newPaymentFee !== undefined) subscriptionUpdate.overridePaymentFee = newPaymentFee;

    if (Object.keys(subscriptionUpdate).length > 0) {
      try {
        await db.update(subscriptions).set(subscriptionUpdate).where(eq(subscriptions.id, subscriptionRow.id));
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    await recordChangeLog(db, {
      customerId: order.customerId,
      subscriptionId: subscriptionRow.id,
      action: "subscription_content_update",
      changes: diffFields([
        { field: "productId", label: "商品", before: subscriptionRow.overrideProductId, after: input.contentOverride.productId },
        { field: "quantity", label: "数量", before: subscriptionRow.overrideQuantity, after: input.contentOverride.quantity },
        { field: "amount", label: "2回目以降価格", before: subscriptionRow.overrideAmount, after: input.contentOverride.amount },
        { field: "interval", label: "お届け頻度", before: subscriptionRow.interval, after: input.contentOverride.interval },
        { field: "paymentMethod", label: "決済方法", before: subscriptionRow.overridePaymentMethod, after: input.contentOverride.paymentMethod },
      ]),
      changedByEmail,
    });
  }

  if (input.resumeSubscription) {
    if (order.type !== "subscription") {
      return NextResponse.json({ error: "定期購入の注文ではありません" }, { status: 400 });
    }
    try {
      await db
        .update(subscriptions)
        .set({ status: "active", nextBillingDate: input.resumeSubscription.nextBillingDate })
        .where(eq(subscriptions.orderId, order.id));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    await recordChangeLog(db, {
      customerId: order.customerId,
      action: "subscription_resume",
      changes: diffFields([
        { field: "status", label: "状態", before: "解約済み", after: "継続中" },
        { field: "nextBillingDate", label: "次回お届け予定日", before: null, after: input.resumeSubscription.nextBillingDate },
      ]),
      changedByEmail,
    });
  }

  if (input.skipNextCycle) {
    if (order.type !== "subscription") {
      return NextResponse.json({ error: "定期購入の注文ではありません" }, { status: 400 });
    }
    let subscriptionRow;
    try {
      [subscriptionRow] = await db
        .select({ id: subscriptions.id, interval: subscriptions.interval, nextBillingDate: subscriptions.nextBillingDate })
        .from(subscriptions)
        .where(eq(subscriptions.orderId, order.id))
        .limit(1);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    if (!subscriptionRow?.nextBillingDate) {
      return NextResponse.json({ error: "次回お届け予定日が設定されていません" }, { status: 400 });
    }
    const nextDate = new Date(subscriptionRow.nextBillingDate);
    nextDate.setDate(nextDate.getDate() + SUBSCRIPTION_INTERVAL_DAYS[subscriptionRow.interval as keyof typeof SUBSCRIPTION_INTERVAL_DAYS]);
    const newNextBillingDate = nextDate.toISOString().slice(0, 10);
    try {
      await db.update(subscriptions).set({ nextBillingDate: newNextBillingDate }).where(eq(subscriptions.id, subscriptionRow.id));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    await recordChangeLog(db, {
      customerId: order.customerId,
      subscriptionId: subscriptionRow.id,
      action: "subscription_skip",
      changes: diffFields([
        { field: "nextBillingDate", label: "次回お届け予定日", before: subscriptionRow.nextBillingDate, after: newNextBillingDate },
      ]),
      changedByEmail,
    });
  }

  if (input.generateNow) {
    if (order.type !== "subscription") {
      return NextResponse.json({ error: "定期購入の注文ではありません" }, { status: 400 });
    }
    let subscriptionRow;
    try {
      [subscriptionRow] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.orderId, order.id))
        .limit(1);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    if (!subscriptionRow) return NextResponse.json({ error: "subscription not found" }, { status: 404 });
    await createDeferredSubscriptionRenewalOrder(subscriptionRow.id);
  }

  return NextResponse.json({ ok: true });
}
