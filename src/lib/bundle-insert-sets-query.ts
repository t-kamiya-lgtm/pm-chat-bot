import { desc } from "drizzle-orm";
import { bundleInsertItems, bundleInsertSets, brands } from "@/db/schema";
import { countDistributedOrders } from "@/lib/bundle-insert-distribution";
import type { Db } from "@/lib/db";

export interface BundleInsertSetWithDetails {
  id: string;
  brand_id: string;
  name: string;
  insert_label: string | null;
  period_start: string;
  period_end: string | null;
  target_order_type: "subscription" | "one_time" | "both";
  target_cycle_numbers: number[] | null;
  target_product_ids: string[] | null;
  item_ids: string[] | null;
  description: string | null;
  status: "active" | "draft";
  distributedCount: number;
  brands: { id: string; name: string; code: string | null } | null;
  items: { id: string; name: string; item_type: string }[];
}

/**
 * 同梱物設定一覧を、ブランド・同梱物の紐付けと累計配布件数(対象条件に合致する注文数)
 * つきで取得する。①同梱物登録(配布実績のある同梱物は削除不可にする判定)・
 * ②同梱物設定の両方の画面で使う共通ロジック。
 */
export async function listBundleInsertSetsWithDetails(
  db: Db,
): Promise<{ sets: BundleInsertSetWithDetails[]; error: string | null }> {
  const [setRows, brandRows, itemRows] = await Promise.all([
    db.select().from(bundleInsertSets).orderBy(desc(bundleInsertSets.periodStart)),
    db.select({ id: brands.id, name: brands.name, code: brands.code }).from(brands),
    db.select({ id: bundleInsertItems.id, name: bundleInsertItems.name, item_type: bundleInsertItems.itemType }).from(bundleInsertItems),
  ]);

  const brandById = new Map(brandRows.map((b) => [b.id, b]));
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  const sets = await Promise.all(
    setRows.map(async (set) => {
      const distributedCount = await countDistributedOrders(db, {
        brandId: set.brandId,
        periodStart: set.periodStart,
        periodEnd: set.periodEnd,
        targetOrderType: set.targetOrderType as "subscription" | "one_time" | "both",
        targetCycleNumbers: set.targetCycleNumbers,
        targetProductIds: set.targetProductIds,
      });
      return {
        id: set.id,
        brand_id: set.brandId,
        name: set.name,
        insert_label: set.insertLabel,
        period_start: set.periodStart,
        period_end: set.periodEnd,
        target_order_type: set.targetOrderType as BundleInsertSetWithDetails["target_order_type"],
        target_cycle_numbers: set.targetCycleNumbers,
        target_product_ids: set.targetProductIds,
        item_ids: set.itemIds,
        description: set.description,
        status: set.status as BundleInsertSetWithDetails["status"],
        brands: brandById.get(set.brandId) ?? null,
        items: (set.itemIds ?? []).map((id) => itemById.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i)),
        distributedCount,
      } satisfies BundleInsertSetWithDetails;
    }),
  );

  return { sets, error: null };
}

/** ある同梱物(itemId)を含む全セットの累計配布件数を合算した、その同梱物自体の配布実績件数。 */
export function sumItemDistribution(sets: BundleInsertSetWithDetails[], itemId: string): number {
  return sets
    .filter((s) => (s.item_ids ?? []).includes(itemId))
    .reduce((sum, s) => sum + s.distributedCount, 0);
}
