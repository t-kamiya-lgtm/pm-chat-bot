import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
 * Vercel Cron(vercel.jsonのcrons設定、毎日1回実行)から呼び出されるエンドポイント。
 * 代引き・後払いの定期購入について、次回お届け予定日が近づいたものの受注データを
 * チャットシステム側で生成し、スマレジへ連携する(スマレジのperiodical_order機能は
 * 使わず、毎回このバッチが生成する方式に統一している)。
 * Stripe決済の定期購入はStripe自体の周期課金Webhookで別途生成されるため対象外。
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + RENEWAL_LEAD_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data: dueSubscriptions, error } = await supabase
    .from("subscriptions")
    .select("id, order_id")
    .eq("status", "active")
    .lte("next_billing_date", cutoffDate);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dueSubscriptions || dueSubscriptions.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const orderIds = dueSubscriptions.map((s) => s.order_id);
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .in("id", orderIds)
    .in("payment_method", ["cod", "deferred_invoice"]);
  const targetOrderIds = new Set((orders ?? []).map((o) => o.id));
  const targets = dueSubscriptions.filter((s) => targetOrderIds.has(s.order_id));

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
