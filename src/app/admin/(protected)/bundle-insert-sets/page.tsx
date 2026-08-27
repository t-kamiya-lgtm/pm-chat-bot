import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BundleInsertSetsList } from "@/components/admin/BundleInsertSetsList";

export const dynamic = "force-dynamic";

export default async function AdminBundleInsertSetsPage() {
  const supabase = createSupabaseAdminClient();
  const [setsRes, brandsRes, productsRes] = await Promise.all([
    supabase
      .from("bundle_insert_sets")
      .select("*, brands(id, name, code)")
      .order("period_start", { ascending: false }),
    supabase.from("brands").select("id, name, code").order("name", { ascending: true }),
    supabase.from("products").select("id, name, smaregi_product_id").order("smaregi_product_id", { ascending: true }),
  ]);

  const loadError = setsRes.error ?? brandsRes.error ?? productsRes.error;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">同梱物設定</h1>
      <p className="mb-4 text-sm text-neutral-500">
        ブランドごとに同梱物セット(例:「ABCセット」)を登録します。期間・対象商品・対象回数(定期の場合)を設定すると、定期分析でこの条件に合致する注文にはこの同梱物セットが適用されたものとして集計されます。
        個々の同梱物(A/B/C)の内訳ではなく、セット単位で効果(単品→定期の引き上げ率、定期継続率)を測定する運用です。
      </p>
      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 p-2 text-xs text-red-700">
          データの取得に失敗しました: {loadError.message}
        </p>
      )}
      <BundleInsertSetsList
        initialSets={(setsRes.data ?? []) as never}
        brands={(brandsRes.data ?? []) as { id: string; name: string; code: string | null }[]}
        products={(productsRes.data ?? []) as { id: string; name: string; smaregi_product_id: string | null }[]}
      />
    </div>
  );
}
