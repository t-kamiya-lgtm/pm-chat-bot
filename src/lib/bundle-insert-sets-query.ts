import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { countDistributedOrders } from "@/lib/bundle-insert-distribution";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

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
  supabase: SupabaseAdminClient,
): Promise<{ sets: BundleInsertSetWithDetails[]; error: string | null }> {
  const [setsRes, brandsRes, itemsRes] = await Promise.all([
    supabase.from("bundle_insert_sets").select("*").order("period_start", { ascending: false }),
    supabase.from("brands").select("id, name, code"),
    supabase.from("bundle_insert_items").select("id, name, item_type"),
  ]);
  const error = setsRes.error?.message ?? brandsRes.error?.message ?? itemsRes.error?.message ?? null;
  if (error) return { sets: [], error };

  const brandById = new Map((brandsRes.data ?? []).map((b) => [b.id as string, b]));
  const itemById = new Map((itemsRes.data ?? []).map((i) => [i.id as string, i]));

  const sets = await Promise.all(
    (setsRes.data ?? []).map(async (set) => {
      const distributedCount = await countDistributedOrders(supabase, {
        brandId: set.brand_id as string,
        periodStart: set.period_start as string,
        periodEnd: set.period_end as string | null,
        targetOrderType: set.target_order_type as "subscription" | "one_time" | "both",
        targetCycleNumbers: set.target_cycle_numbers as number[] | null,
        targetProductIds: set.target_product_ids as string[] | null,
      });
      return {
        ...set,
        brands: brandById.get(set.brand_id as string) ?? null,
        items: ((set.item_ids as string[] | null) ?? [])
          .map((id) => itemById.get(id))
          .filter((i): i is NonNullable<typeof i> => Boolean(i)),
        distributedCount,
      } as BundleInsertSetWithDetails;
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
