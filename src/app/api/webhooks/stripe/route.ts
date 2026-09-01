import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { and, eq, isNull } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { orders, subscriptions } from "@/db/schema";
import { recordCouponUsage } from "@/lib/coupons";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";
import { createSubscriptionRenewalOrder } from "@/lib/subscription-renewal";
import { submitStripeOrderToCoreSystem } from "@/lib/core-system-sync";
import { assignCustomerNumberIfNeeded } from "@/lib/customer-number";

export const runtime = "nodejs";

// Stripeの請求書API(parent構造)からサブスクリプションIDを取り出す
function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | undefined {
  const subscriptionDetails =
    invoice.parent?.type === "subscription_details" ? invoice.parent.subscription_details : null;
  const subscription = subscriptionDetails?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id;
}

/**
 * 通常の定期購入はpayment_settings.save_default_payment_methodにより、初回決済で使った
 * 支払い方法がSubscriptionの既定支払い方法として自動保存される。ただし「お試し→本品自動切替」
 * プラン(Subscription Schedule)はこのパラメータに対応していないため、初回invoice決済後に
 * 使われた支払い方法を、ここで明示的に顧客の既定支払い方法として保存する
 * (Subscriptionに既定支払い方法が無い場合、Stripeは顧客の既定支払い方法にフォールバックするため)。
 */
async function saveDefaultPaymentMethodFromInvoice(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  try {
    const invoiceWithPayments = await stripe.invoices.retrieve(invoice.id!, {
      expand: ["payments.data.payment.payment_intent"],
    });
    const payment = invoiceWithPayments.payments?.data[0]?.payment;
    const paymentIntent = payment?.payment_intent;
    const paymentIntentObject =
      typeof paymentIntent === "string" ? await stripe.paymentIntents.retrieve(paymentIntent) : paymentIntent;
    const paymentMethodId =
      typeof paymentIntentObject?.payment_method === "string"
        ? paymentIntentObject.payment_method
        : paymentIntentObject?.payment_method?.id;
    if (!paymentMethodId) return;

    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;

    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  } catch (err) {
    console.error("[webhooks/stripe] failed to save default payment method", { invoiceId: invoice.id, err });
  }
}

/**
 * Stripe Webhook受信。署名検証を行った上で、注文・サブスクリプション状態をDBに反映する。
 * Stripe決済の注文はスマレジには連携しないが、決済確定後にチャットシステムから基幹システムへ
 * 取り込む(受注確認はチャットシステム、入金突合せはStripe側で行う運用のため)。
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

  const db = await getDb();

  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const [order] = await db
        .select({ id: orders.id, status: orders.status, type: orders.type, couponId: orders.couponId, customerId: orders.customerId })
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
        .limit(1);

      if (order && order.type === "one_time" && order.status !== "paid") {
        // Stripe注文はフルフィル担当が基幹システムへ手動で取り込むため、受注ステータスは変更しない(未取込みのまま)
        await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
        await sendOrderCompletionEmail(order.id);
        await submitStripeOrderToCoreSystem(order.id);
        await assignCustomerNumberIfNeeded(order.customerId);
        // クーポンの使用回数は決済確定時点で加算する(与信のみで完了前の失敗・放棄では消費しない)
        if (order.couponId) await recordCouponUsage(db, order.couponId);
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getSubscriptionIdFromInvoice(invoice);
      if (!subscriptionId) break;

      // 定期購入は「初回の注文行」1件のみをこの条件で特定する(2回目以降は別行として生成するため)
      const [order] = await db
        .select({ id: orders.id, status: orders.status, couponId: orders.couponId, customerId: orders.customerId })
        .from(orders)
        .where(and(eq(orders.stripeSubscriptionId, subscriptionId), isNull(orders.parentOrderId)))
        .limit(1);
      if (!order) break;

      const periodEnd = invoice.lines.data[0]?.period?.end;
      if (periodEnd) {
        await db
          .update(subscriptions)
          .set({ nextBillingDate: new Date(periodEnd * 1000).toISOString().slice(0, 10) })
          .where(eq(subscriptions.orderId, order.id));
      }

      if (invoice.billing_reason === "subscription_cycle") {
        // 2回目以降の周期課金: チャットシステム内に今回分の注文データを新規生成する
        await createSubscriptionRenewalOrder({ stripeSubscriptionId: subscriptionId, invoiceId: invoice.id });
      } else if (order.status !== "paid") {
        // Stripe注文はフルフィル担当が基幹システムへ手動で取り込むため、受注ステータスは変更しない(未取込みのまま)
        await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
        await sendOrderCompletionEmail(order.id);
        await submitStripeOrderToCoreSystem(order.id);
        await assignCustomerNumberIfNeeded(order.customerId);
        // クーポンの使用回数は初回決済確定時点で加算する(以降の定期課金では加算しない)
        if (order.couponId) await recordCouponUsage(db, order.couponId);
        // お試し→本品自動切替プラン(Subscription Schedule)は payment_settings.save_default_payment_method
        // が使えないため、初回決済で使われた支払い方法を顧客の既定支払い方法として明示的に保存する
        // (2回目以降、自動切替後のフェーズの請求もこの支払い方法で継続課金されるようにするため)。
        await saveDefaultPaymentMethodFromInvoice(stripe, invoice);
      }
      break;
    }

    case "payment_intent.payment_failed": {
      // 単品購入(PaymentIntent)のカード失敗。受注ステータスを「保留」にして
      // フルフィル担当が気づけるようにする(従来はここが未実装で、失敗した単品注文が
      // 「処理中」のまま放置されていた)。
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const [order] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
        .limit(1);
      if (order) {
        await db
          .update(orders)
          .set({ status: "failed", importStatus: "on_hold", importStatusUpdatedAt: new Date().toISOString() })
          .where(eq(orders.id, order.id));
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getSubscriptionIdFromInvoice(invoice);
      if (!subscriptionId) break;

      const [order] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.stripeSubscriptionId, subscriptionId), isNull(orders.parentOrderId)))
        .limit(1);
      if (!order) break;

      if (invoice.billing_reason === "subscription_cycle") {
        // 2回目以降の周期課金の失敗。この時点では失敗した回の注文データは存在しない
        // (invoice.paidで初めて生成するため)。決済済みの初回注文のstatusを誤って
        // 書き換えないよう、初回注文はimport_statusを「保留」にするだけに留め、
        // フルフィル担当が気づいて個別対応(顧客連絡・カード変更/代引き後払いへの切替等)できるようにする。
        await db
          .update(orders)
          .set({ importStatus: "on_hold", importStatusUpdatedAt: new Date().toISOString() })
          .where(eq(orders.id, order.id));
      } else {
        // 定期初回の決済失敗。
        await db
          .update(orders)
          .set({ status: "failed", importStatus: "on_hold", importStatusUpdatedAt: new Date().toISOString() })
          .where(eq(orders.id, order.id));
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const [order] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.stripeSubscriptionId, subscription.id), isNull(orders.parentOrderId)))
        .limit(1);
      if (!order) break;

      const status =
        subscription.status === "canceled"
          ? "canceled"
          : subscription.pause_collection
            ? "paused"
            : "active";

      await db.update(subscriptions).set({ status }).where(eq(subscriptions.orderId, order.id));
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
