import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 決済フォーム入力途中で離脱した見込み客(名前・電話番号・メールアドレス・選択商品)の一覧。
 * スマレジ等への正式な連携が整うまでの間、CSVダウンロードして手動で活用する想定。
 */
export default async function AdminLeadsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: leads } = await supabase
    .from("leads")
    .select("*, products(name)")
    .order("updated_at", { ascending: false })
    .limit(500);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">離脱リード</h1>
          <p className="mt-1 text-sm text-neutral-500">
            決済フォームの入力途中で離脱したお客様の情報です。氏名・電話番号・メールアドレスのいずれかが
            入力された時点で記録されます(注文が完了した場合もここには残ります)。
          </p>
        </div>
        <a
          href="/api/leads/export"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          CSVダウンロード
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">更新日時</th>
              <th className="px-4 py-2">お名前</th>
              <th className="px-4 py-2">電話番号</th>
              <th className="px-4 py-2">メールアドレス</th>
              <th className="px-4 py-2">選択商品</th>
            </tr>
          </thead>
          <tbody>
            {leads?.map(
              (lead: {
                id: string;
                updated_at: string;
                name: string | null;
                phone: string | null;
                email: string | null;
                products: { name: string } | null;
              }) => (
                <tr key={lead.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(lead.updated_at).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-4 py-2">{lead.name ?? "-"}</td>
                  <td className="px-4 py-2">{lead.phone ?? "-"}</td>
                  <td className="px-4 py-2">{lead.email ?? "-"}</td>
                  <td className="px-4 py-2">{lead.products?.name ?? "-"}</td>
                </tr>
              ),
            )}
            {!leads?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  離脱リードはまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
