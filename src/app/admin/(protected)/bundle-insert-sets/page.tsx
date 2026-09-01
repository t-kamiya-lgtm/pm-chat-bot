import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bundleInsertItems, brands, products } from "@/db/schema";
import { listBundleInsertSetsWithDetails, sumItemDistribution } from "@/lib/bundle-insert-sets-query";
import { BundleInsertTabs } from "@/components/admin/BundleInsertTabs";

export const dynamic = "force-dynamic";

export default async function AdminBundleInsertSetsPage() {
  const db = await getDb();

  let loadError: string | null = null;
  let items: unknown[] = [];
  let sets: Awaited<ReturnType<typeof listBundleInsertSetsWithDetails>>["sets"] = [];
  let brandRows: { id: string; name: string; code: string | null }[] = [];
  let productRows: { id: string; name: string; smaregi_product_id: string | null }[] = [];

  try {
    const [itemRows, brandResult, productResult, setsResult] = await Promise.all([
      db.select().from(bundleInsertItems).orderBy(asc(bundleInsertItems.registeredDate)),
      db.select({ id: brands.id, name: brands.name, code: brands.code }).from(brands).orderBy(asc(brands.name)),
      db
        .select({ id: products.id, name: products.name, smaregiProductId: products.smaregiProductId })
        .from(products)
        .orderBy(asc(products.smaregiProductId)),
      listBundleInsertSetsWithDetails(db),
    ]);

    brandRows = brandResult;
    productRows = productResult.map((p) => ({ id: p.id, name: p.name, smaregi_product_id: p.smaregiProductId }));
    sets = setsResult.sets;

    const brandById = new Map(brandRows.map((b) => [b.id, b]));
    items = itemRows.map((item) => ({
      id: item.id,
      brand_id: item.brandId,
      item_type: item.itemType,
      name: item.name,
      registered_date: item.registeredDate,
      url: item.url,
      status: item.status,
      brands: brandById.get(item.brandId) ?? null,
      distributedCount: sumItemDistribution(sets, item.id),
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

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
        brands={brandRows}
        products={productRows}
      />
    </div>
  );
}
