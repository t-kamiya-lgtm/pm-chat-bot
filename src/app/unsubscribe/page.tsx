import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads } from "@/db/schema";

export const dynamic = "force-dynamic";

/** 離脱者リマインドメール内の配信停止リンク先。leadIdを未送信状態に更新するだけの公開ページ。 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const { leadId } = await searchParams;

  if (leadId) {
    try {
      const db = await getDb();
      await db
        .update(leads)
        .set({ unsubscribedAt: new Date().toISOString() })
        .where(and(eq(leads.id, leadId), isNull(leads.unsubscribedAt)));
    } catch (err) {
      console.error("[unsubscribe] failed to update lead", err);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
      <p className="max-w-sm text-center text-sm text-neutral-700">
        メールの配信を停止しました。今後、ご案内メールは送信されません。
      </p>
    </main>
  );
}
