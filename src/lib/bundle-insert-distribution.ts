import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];

export interface DistributionCountTarget {
  brandId: string;
  periodStart: string;
  periodEnd: string | null;
  targetOrderType: "subscription" | "one_time" | "both";
  targetCycleNumbers: number[] | null;
  targetProductIds: string[] | null;
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 「累計配布件数」= この同梱物設定の対象条件(期間・対象種別・対象回数・対象商品)に
 * 合致する注文(支払い完了/受付済み)の件数。同梱したかどうかを個別に記録する仕組みは
 * 持たないため、条件から都度再集計する。
 */
export async function countDistributedOrders(
  supabase: SupabaseAdminClient,
  target: DistributionCountTarget,
): Promise<number> {
  let productIds = target.targetProductIds;
  if (!productIds) {
    const { data: groups } = await supabase.from("product_groups").select("id").eq("brand_id", target.brandId);
    const groupIds = (groups ?? []).map((g) => g.id as string);
    if (groupIds.length === 0) return 0;
    const { data: products } = await supabase.from("products").select("id").in("product_group_id", groupIds);
    productIds = (products ?? []).map((p) => p.id as string);
  }
  if (productIds.length === 0) return 0;

  let query = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("product_id", productIds)
    .in("status", CONFIRMED_ORDER_STATUSES)
    .gte("created_at", target.periodStart);

  if (target.periodEnd) query = query.lt("created_at", nextDay(target.periodEnd));
  if (target.targetOrderType !== "both") query = query.eq("type", target.targetOrderType);
  if (target.targetCycleNumbers) query = query.in("billing_cycle_number", target.targetCycleNumbers);

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}
