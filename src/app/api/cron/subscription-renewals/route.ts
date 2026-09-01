import { NextResponse } from "next/server";
import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, subscriptions } from "@/db/schema";
import { createDeferredSubscriptionRenewalOrder } from "@/lib/subscription-renewal";

export const runtime = "nodejs";

// 次回お届け予定日の7日前(次回出荷日の5日前)になったら、次回分の受注データを生成する。
const RENEWAL_LEAD_DAYS = 7;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

/**
 * Cloud Scheduler(毎日23時に実行、docs/deploy.md参照)から呼び出されるエンドポイント。
 * 代引き・後払いの定期購入について、次回お届け予定日が近づいたものの受注データを
 * チャットシステム側で生成し、スマレジへ連携する(スマレジのperiodical_order機能は
 * 使わず、毎回このバッチが生成する方式に統一している)。
 * Stripe決済の定期購入はStripe自体の周期課金Webhookで別途生成されるため対象外。
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + RENEWAL_LEAD_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  let dueSubscriptions;
  try {
    dueSubscriptions = await db
      .select({ id: subscriptions.id, orderId: subscriptions.orderId, overridePaymentMethod: subscriptions.overridePaymentMethod })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, "active"), lte(subscriptions.nextBillingDate, cutoffDate)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (dueSubscriptions.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // 実効の決済方法(スタッフによる個別上書きがあればそちらを優先)がcod/deferred_invoiceのものだけを対象にする。
  const orderIds = dueSubscriptions.map((s) => s.orderId);
  const orderRows = await db.select({ id: orders.id, paymentMethod: orders.paymentMethod }).from(orders).where(inArray(orders.id, orderIds));
  const paymentMethodByOrderId = new Map(orderRows.map((o) => [o.id, o.paymentMethod]));
  const targets = dueSubscriptions.filter((s) => {
    const effective = s.overridePaymentMethod ?? paymentMethodByOrderId.get(s.orderId);
    return effective === "cod" || effective === "deferred_invoice";
  });

  for (const sub of targets) {
    try {
      await createDeferredSubscriptionRenewalOrder(sub.id);
    } catch (err) {
      console.error("[cron/subscription-renewals] failed", { subscriptionId: sub.id, err });
    }
  }

  return NextResponse.json({ processed: targets.length });
}

export { POST as GET };
