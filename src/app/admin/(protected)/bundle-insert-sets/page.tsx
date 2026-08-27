import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listBundleInsertSetsWithDetails, sumItemDistribution } from "@/lib/bundle-insert-sets-query";
import { BundleInsertTabs } from "@/components/admin/BundleInsertTabs";

export const dynamic = "force-dynamic";

export default async function AdminBundleInsertSetsPage() {
  const supabase = createSupabaseAdminClient();
  // brandsとの結合(embed)はPostgRESTのリレーションキャッシュが新しいFKに追随するまで
  // 失敗することがあるため使わず、別々に取得してJS側で紐付ける。
  const [itemsRes, brandsRes, productsRes, { sets, error: setsError }] = await Promise.all([
    supabase.from("bundle_insert_items").select("*").order("registered_date", { ascending: false }),
    supabase.from("brands").select("id, name, code").order("name", { ascending: true }),
    supabase.from("products").select("id, name, smaregi_product_id").order("smaregi_product_id", { ascending: true }),
    listBundleInsertSetsWithDetails(supabase),
  ]);

  const loadError = itemsRes.error?.message ?? brandsRes.error?.message ?? productsRes.error?.message ?? setsError;
  const brandById = new Map((brandsRes.data ?? []).map((b) => [b.id as string, b]));

  const items = (itemsRes.data ?? []).map((item) => ({
    ...item,
    brands: brandById.get(item.brand_id as string) ?? null,
    distributedCount: sumItemDistribution(sets, item.id as string),
  }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">同梱物設定</h1>
      <p className="mb-4 text-sm text-neutral-500">
        ①で個々の同梱物を登録し、②でそれらを選んでセット化します。期間・対象商品・対象回数(定期の場合)を設定すると、定期分析でこの条件に合致する注文にはこの同梱物セットが適用されたものとして集計されます。
      </p>
      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 p-2 text-xs text-red-700">
          データの取得に失敗しました: {loadError}
        </p>
      )}
      <BundleInsertTabs
        items={items as never}
        sets={sets as never}
        brands={(brandsRes.data ?? []) as { id: string; name: string; code: string | null }[]}
        products={(productsRes.data ?? []) as { id: string; name: string; smaregi_product_id: string | null }[]}
      />
    </div>
  );
}
