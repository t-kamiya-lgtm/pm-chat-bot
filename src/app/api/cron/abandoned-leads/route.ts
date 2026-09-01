import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads, products, scenarios } from "@/db/schema";
import { sendResendEmail } from "@/lib/email";
import { getEmailTemplates, renderEmailTemplate } from "@/lib/email-templates";
import { buildChatUrl } from "@/lib/chat-url";
import { resolveScenarioFrom, type ScenarioEmailFields } from "@/lib/scenario-email";

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

  const db = await getDb();
  const now = Date.now();
  let abandonedLeads;
  try {
    abandonedLeads = await db
      .select({ id: leads.id, name: leads.name, email: leads.email, productId: leads.productId, scenarioId: leads.scenarioId })
      .from(leads)
      .where(
        and(
          eq(leads.orderStatus, "abandoned"),
          isNull(leads.unsubscribedAt),
          isNull(leads.abandonedEmailSentAt),
          isNotNull(leads.email),
          lte(leads.updatedAt, new Date(now - ABANDONED_AFTER_MS).toISOString()),
          gte(leads.updatedAt, new Date(now - ABANDONED_WITHIN_MS).toISOString()),
        ),
      );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (abandonedLeads.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0 });
  }

  const templates = await getEmailTemplates();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  let sent = 0;

  // シナリオ(ブランド)ごとに送信元アドレスが設定されていれば、共通アドレスより優先して使う
  const scenarioIds = Array.from(new Set(abandonedLeads.map((l) => l.scenarioId).filter((id): id is string => Boolean(id))));
  const scenarioFromById = new Map<string, ScenarioEmailFields | null>();
  if (scenarioIds.length > 0) {
    const scenarioRows = await db
      .select({ id: scenarios.id, emailFromAddress: scenarios.emailFromAddress, abandonedReminderFrom: scenarios.abandonedReminderFrom })
      .from(scenarios)
      .where(inArray(scenarios.id, scenarioIds));
    for (const s of scenarioRows) {
      scenarioFromById.set(s.id, { email_from_address: s.emailFromAddress, abandoned_reminder_from: s.abandonedReminderFrom });
    }
  }

  for (const lead of abandonedLeads) {
    // 複数のCron実行が重なっても二重送信しないよう、送信前に自分だけが処理対象であることを確定させる
    let claimed;
    try {
      [claimed] = await db
        .update(leads)
        .set({ abandonedEmailSentAt: new Date().toISOString() })
        .where(and(eq(leads.id, lead.id), isNull(leads.abandonedEmailSentAt)))
        .returning({ id: leads.id });
    } catch {
      claimed = null;
    }
    if (!claimed || !lead.email) continue;

    try {
      const [product, chatUrl] = await Promise.all([
        lead.productId
          ? db
              .select({ name: products.name })
              .from(products)
              .where(eq(products.id, lead.productId))
              .limit(1)
              .then((r) => r[0] ?? null)
          : Promise.resolve(null),
        buildChatUrl(db, lead.scenarioId),
      ]);

      const vars = {
        customer_name: lead.name ?? "",
        product_name: product?.name ?? "",
        chat_url: chatUrl,
        unsubscribe_url: `${siteUrl}/unsubscribe?leadId=${lead.id}`,
      };

      const scenario = lead.scenarioId ? scenarioFromById.get(lead.scenarioId) : null;
      const from = resolveScenarioFrom(scenario, "abandoned_reminder_from");
      const wasSent = await sendResendEmail({
        to: lead.email,
        from,
        subject: renderEmailTemplate(templates.abandonedLeadSubject, vars),
        text: renderEmailTemplate(templates.abandonedLeadBody, vars),
      });
      if (wasSent) {
        sent++;
        // メールアドレスがあり実際に送信できた場合、アクセスログ上も「メール対応済み」にする
        await db.update(leads).set({ contactedEmail: true }).where(eq(leads.id, lead.id));
      }
    } catch (err) {
      console.error("[cron/abandoned-leads] failed to send", { leadId: lead.id, err });
    }
  }

  return NextResponse.json({ processed: abandonedLeads.length, sent });
}

export { POST as GET };
