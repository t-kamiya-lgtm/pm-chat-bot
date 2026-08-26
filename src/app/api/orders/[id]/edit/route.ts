import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminRole } from "@/lib/require-role";
import { shippingAddressSchema, subscriptionIntervalSchema } from "@/lib/checkout-schema";
import { SUBSCRIPTION_INTERVAL_STRIPE_MAP } from "@/lib/subscription-intervals";

const updateSchema = z.object({
  shippingAddress: shippingAddressSchema.nullable().optional(),
  deliveryDate: z.string().optional(),
  deliveryTimeSlot: z.string().optional(),
  subscriptionInterval: subscriptionIntervalSchema.optional(),
  cancelSubscription: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 顧客からの申告による、お届け先・お届け頻度の変更、定期解約をadmin権限で行う。
 * 金額が変わる変更は再注文が必要なため対象外。
 * お届け先・頻度の変更は、この(定期の親)注文に対して行うことで、以降の定期継続分
 * (createSubscriptionRenewalOrderがこの注文を元に生成するもの)にも自動的に反映される。
 * 頻度変更はStripe決済の定期購入のみ対応(Stripeのサブスクリプション自体も更新する必要があるため)。
 * 解約は支払方法を問わずすべての定期購入で対応する。代引き・後払いは当システム側で
 * 2回目以降の受注データを生成する方式のため、subscriptions.statusをcanceledにするだけで
 * 以後の生成バッチ(/api/cron/subscription-renewals)の対象外になる。
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

  const supabase = createSupabaseAdminClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, type, payment_method, amount, shipping_fee, payment_fee, stripe_subscription_id, parent_order_id")
    .eq("id", id)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.parent_order_id) {
    return NextResponse.json(
      { error: "定期の親注文(初回)に対してのみ変更できます" },
      { status: 400 },
    );
  }

  const orderUpdate: Record<string, unknown> = {};
  if (input.shippingAddress !== undefined) orderUpdate.shipping_address = input.shippingAddress;
  if (input.deliveryDate !== undefined) orderUpdate.delivery_date = input.deliveryDate || null;
  if (input.deliveryTimeSlot !== undefined) orderUpdate.delivery_time_slot = input.deliveryTimeSlot || null;

  if (Object.keys(orderUpdate).length > 0) {
    const { error } = await supabase.from("orders").update(orderUpdate).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const isStripeSubscription = order.type === "subscription" && order.payment_method === "stripe";

  if (input.subscriptionInterval !== undefined) {
    if (!isStripeSubscription || !order.stripe_subscription_id) {
      return NextResponse.json(
        { error: "Stripeの定期購入以外は頻度変更に対応していません" },
        { status: 400 },
      );
    }
    try {
      const stripe = getStripeClient();
      const subscription = await stripe.subscriptions.retrieve(order.stripe_subscription_id);
      const item = subscription.items.data[0];
      if (!item) throw new Error("subscription item not found");

      const { interval, intervalCount } = SUBSCRIPTION_INTERVAL_STRIPE_MAP[input.subscriptionInterval];
      const newPrice = await stripe.prices.create({
        currency: "jpy",
        unit_amount: order.amount + order.shipping_fee + order.payment_fee,
        recurring: { interval, interval_count: intervalCount },
        product_data: { name: `定期便(頻度変更: ${input.subscriptionInterval})` },
      });

      await stripe.subscriptions.update(order.stripe_subscription_id, {
        items: [{ id: item.id, price: newPrice.id }],
        proration_behavior: "none",
      });

      await supabase
        .from("subscriptions")
        .update({ interval: input.subscriptionInterval })
        .eq("order_id", order.id);
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
      if (!order.stripe_subscription_id) {
        return NextResponse.json(
          { error: "Stripeのサブスクリプション情報が見つかりません" },
          { status: 400 },
        );
      }
      try {
        const stripe = getStripeClient();
        await stripe.subscriptions.cancel(order.stripe_subscription_id);
      } catch (err) {
        console.error("[orders/edit] failed to cancel subscription", { orderId: id, err });
        return NextResponse.json({ error: "Stripeでの解約処理に失敗しました" }, { status: 500 });
      }
    }
    await supabase.from("subscriptions").update({ status: "canceled" }).eq("order_id", order.id);
  }

  return NextResponse.json({ ok: true });
}
