import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fulfillOrder } from "@/lib/order-fulfillment";
import { recordCouponUsage } from "@/lib/coupons";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";

export const runtime = "nodejs";

// Stripeの請求書API(parent構造)からサブスクリプションIDを取り出す
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
  const subscriptionDetails =
    invoice.parent?.type === "subscription_details" ? invoice.parent.subscription_details : null;
  const subscription = subscriptionDetails?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id;
}

/**
 * Stripe Webhook受信。署名検証を行った上で、注文・サブスクリプション状態をDBに反映する。
 * 決済成功時に会員情報移行(fulfillOrder)を実行する。
 */
export async function POST(request: Request) {
  const stripe = getStripeClient();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `invalid signature: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { data: order } = await supabase
        .from("orders")
        .select("id, status, type, coupon_id")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();

      if (order && order.type === "one_time" && order.status !== "paid") {
        // Stripe側で自動的に決済・記録が完結するため、取り込みステータスも自動で完了扱いにする
        await supabase
          .from("orders")
          .update({ status: "paid", import_status: "imported", import_status_updated_at: new Date().toISOString() })
          .eq("id", order.id);
        await fulfillOrder(order.id);
        await sendOrderCompletionEmail(order.id);
        // クーポンの使用回数は決済確定時点で加算する(与信のみで完了前の失敗・放棄では消費しない)
        if (order.coupon_id) await recordCouponUsage(supabase, order.coupon_id);
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getSubscriptionIdFromInvoice(invoice);
      if (!subscriptionId) break;

      const { data: order } = await supabase
        .from("orders")
        .select("id, status, coupon_id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (!order) break;

      const periodEnd = invoice.lines.data[0]?.period?.end;
      if (periodEnd) {
        await supabase
          .from("subscriptions")
          .update({ next_billing_date: new Date(periodEnd * 1000).toISOString().slice(0, 10) })
          .eq("order_id", order.id);
      }

      if (order.status !== "paid") {
        await supabase
          .from("orders")
          .update({ status: "paid", import_status: "imported", import_status_updated_at: new Date().toISOString() })
          .eq("id", order.id);
        await fulfillOrder(order.id);
        await sendOrderCompletionEmail(order.id);
        // クーポンの使用回数は初回決済確定時点で加算する(以降の定期課金では加算しない)
        if (order.coupon_id) await recordCouponUsage(supabase, order.coupon_id);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getSubscriptionIdFromInvoice(invoice);
      if (!subscriptionId) break;

      const { data: order } = await supabase
        .from("orders")
        .select("id")
        .eq("stripe_subscription_id", subscriptionId)
        .maybeSingle();
      if (order) {
        await supabase.from("orders").update({ status: "failed" }).eq("id", order.id);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const { data: order } = await supabase
        .from("orders")
        .select("id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();
      if (!order) break;

      const status =
        subscription.status === "canceled"
          ? "canceled"
          : subscription.pause_collection
            ? "paused"
            : "active";

      await supabase.from("subscriptions").update({ status }).eq("order_id", order.id);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
