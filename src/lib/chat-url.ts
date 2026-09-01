import { eq } from "drizzle-orm";
import { scenarios } from "@/db/schema";
import type { Db } from "@/lib/db";

/**
 * 自動メール本文の{{chat_url}}用に、シナリオの公開URL(/widget/<slug>)を組み立てる。
 * これは同じシナリオのチャットへの入り口を再度案内するだけで、離脱前の会話の続きから
 * 再開できるわけではない(セッション自体は新規に開始される)。
 * slug未設定のシナリオ、またはscenarioId自体が不明な場合は、共通の /widget にフォールバックする。
 */
export async function buildChatUrl(db: Db, scenarioId: string | null | undefined): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!scenarioId) return `${siteUrl}/widget`;
  const [data] = await db.select({ slug: scenarios.slug }).from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
  return data?.slug ? `${siteUrl}/widget/${data.slug}` : `${siteUrl}/widget`;
}
