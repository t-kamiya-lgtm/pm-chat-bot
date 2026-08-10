import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** 離脱者リマインドメール内の配信停止リンク先。leadIdを未送信状態に更新するだけの公開ページ。 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const { leadId } = await searchParams;

  if (leadId) {
    const supabase = createSupabaseAdminClient();
    await supabase
      .from("leads")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("unsubscribed_at", null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
      <p className="max-w-sm text-center text-sm text-neutral-700">
        メールの配信を停止しました。今後、ご案内メールは送信されません。
      </p>
    </main>
  );
}
