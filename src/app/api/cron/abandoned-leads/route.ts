import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email";
import { getEmailTemplates, renderEmailTemplate } from "@/lib/email-templates";

export const runtime = "nodejs";

const ABANDONED_AFTER_MS = 60 * 60 * 1000; // 離脱から1時間経過したら送信対象
// 導入時点で既に離脱していた古いリードへ一斉送信されるのを防ぐための上限
const ABANDONED_WITHIN_MS = 24 * 60 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

/**
 * Vercel Cron(vercel.jsonのcrons設定、毎時0分に実行)から呼び出されるエンドポイント。
 * 入力途中で離脱し、1時間以上更新のないリードへリマインドメールを送る。
 * CRON_SECRET環境変数を設定しておくと、Vercelがcron実行時に自動で
 * "Authorization: Bearer <CRON_SECRET>" ヘッダーを付与するため、それで認証する
 * (外部Cronサービスから直接叩く場合はクエリ "?secret=" でも可)。
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const now = Date.now();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, name, email, product_id")
    .eq("order_status", "abandoned")
    .is("unsubscribed_at", null)
    .is("abandoned_email_sent_at", null)
    .not("email", "is", null)
    .lte("updated_at", new Date(now - ABANDONED_AFTER_MS).toISOString())
    .gte("updated_at", new Date(now - ABANDONED_WITHIN_MS).toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!leads || leads.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0 });
  }

  const templates = await getEmailTemplates(supabase);
  const from = process.env.ORDER_EMAIL_FROM ?? "chatbot@example.com";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let sent = 0;

  for (const lead of leads) {
    // 複数のCron実行が重なっても二重送信しないよう、送信前に自分だけが処理対象であることを確定させる
    const { data: claimed } = await supabase
      .from("leads")
      .update({ abandoned_email_sent_at: new Date().toISOString() })
      .eq("id", lead.id)
      .is("abandoned_email_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed || !lead.email) continue;

    try {
      const product = lead.product_id
        ? (await supabase.from("products").select("name").eq("id", lead.product_id).maybeSingle()).data
        : null;

      const vars = {
        customer_name: lead.name ?? "",
        product_name: product?.name ?? "",
        unsubscribe_url: `${siteUrl}/unsubscribe?leadId=${lead.id}`,
      };

      const wasSent = await sendResendEmail({
        to: lead.email,
        from,
        subject: renderEmailTemplate(templates.abandonedLeadSubject, vars),
        text: renderEmailTemplate(templates.abandonedLeadBody, vars),
      });
      if (wasSent) {
        sent++;
        // メールアドレスがあり実際に送信できた場合、アクセスログ上も「メール対応済み」にする
        await supabase.from("leads").update({ contacted_email: true }).eq("id", lead.id);
      }
    } catch (err) {
      console.error("[cron/abandoned-leads] failed to send", { leadId: lead.id, err });
    }
  }

  return NextResponse.json({ processed: leads.length, sent });
}

export { POST as GET };
