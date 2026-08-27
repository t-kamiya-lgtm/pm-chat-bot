import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface OrderCostSnapshot {
  cost_amount: number;
  bundle_insert_cost: number;
  shipping_cost: number;
  sales_commission_amount: number;
  tax_rate: number | null;
}

const EMPTY_SNAPSHOT: OrderCostSnapshot = {
  cost_amount: 0,
  bundle_insert_cost: 0,
  shipping_cost: 0,
  sales_commission_amount: 0,
  tax_rate: null,
};

/**
 * 注文作成時点の商品コスト設定(原価・同梱物費用・送料原価・販売手数料)と、
 * 商品ジャンル(product_groups)に対して期間設定された税率をスナップショットとして求める。
 * 後から商品のコスト設定や税率メニューを変更しても、過去の注文の増分利益実績は変わらない
 * (価格・決済手数料と同じスナップショット方式)。
 * embed(結合)クエリはPostgRESTのリレーションキャッシュ更新待ちで失敗することがあるため使わず、
 * 単純なselectを複数回に分けてJS側で解決する。
 */
export async function resolveOrderCostSnapshot(
  supabase: SupabaseAdminClient,
  productId: string,
  orderDateIso: string,
): Promise<OrderCostSnapshot> {
  const { data: product } = await supabase
    .from("products")
    .select("product_group_id, cost_amount, bundle_insert_cost, shipping_cost, sales_commission_amount")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return EMPTY_SNAPSHOT;

  const orderDate = orderDateIso.slice(0, 10);
  let taxRate: number | null = null;
  if (product.product_group_id) {
    const { data: assignments } = await supabase
      .from("product_group_tax_rates")
      .select("tax_rate_id, period_start, period_end")
      .eq("product_group_id", product.product_group_id as string)
      .lte("period_start", orderDate);
    const applicable = (assignments ?? [])
      .filter((a) => !a.period_end || (a.period_end as string) >= orderDate)
      .sort((a, b) => (a.period_start < b.period_start ? 1 : -1))[0];
    if (applicable) {
      const { data: taxRateRow } = await supabase
        .from("tax_rates")
        .select("rate")
        .eq("id", applicable.tax_rate_id as string)
        .maybeSingle();
      taxRate = (taxRateRow?.rate as number | undefined) ?? null;
    }
  }

  return {
    cost_amount: (product.cost_amount as number | null) ?? 0,
    bundle_insert_cost: (product.bundle_insert_cost as number | null) ?? 0,
    shipping_cost: (product.shipping_cost as number | null) ?? 0,
    sales_commission_amount: (product.sales_commission_amount as number | null) ?? 0,
    tax_rate: taxRate,
  };
}

export interface IncrementalProfitFields {
  amount: number;
  addon_amount: number | null;
  discount_amount: number | null;
  first_time_discount_amount: number | null;
  shipping_fee: number;
  payment_fee: number;
  cost_amount: number | null;
  bundle_insert_cost: number | null;
  shipping_cost: number | null;
  sales_commission_amount: number | null;
}

/**
 * 広告費除く増分利益 = 売上(税込) - 原価 - 同梱物費用 - 送料原価 - 販売手数料 - 支払手数料。
 * コストのスナップショットが無い(導入前の)注文はnullを返す(0円ではなく「不明」として扱う)。
 */
export function incrementalProfit(order: IncrementalProfitFields): number | null {
  if (order.cost_amount === null || order.bundle_insert_cost === null) return null;
  const revenue =
    order.amount +
    (order.addon_amount ?? 0) +
    order.shipping_fee +
    order.payment_fee -
    (order.discount_amount ?? 0) -
    (order.first_time_discount_amount ?? 0);
  return (
    revenue -
    order.cost_amount -
    order.bundle_insert_cost -
    (order.shipping_cost ?? 0) -
    (order.sales_commission_amount ?? 0) -
    order.payment_fee
  );
}
