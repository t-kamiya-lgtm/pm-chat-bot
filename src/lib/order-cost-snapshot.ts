import { and, eq, lte } from "drizzle-orm";
import { productGroupTaxRates, products, taxRates } from "@/db/schema";
import type { Db } from "@/lib/db";

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
 */
export async function resolveOrderCostSnapshot(
  db: Db,
  productId: string,
  orderDateIso: string,
): Promise<OrderCostSnapshot> {
  const [product] = await db
    .select({
      productGroupId: products.productGroupId,
      costAmount: products.costAmount,
      bundleInsertCost: products.bundleInsertCost,
      shippingCost: products.shippingCost,
      salesCommissionAmount: products.salesCommissionAmount,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return EMPTY_SNAPSHOT;

  const orderDate = orderDateIso.slice(0, 10);
  let taxRate: number | null = null;
  if (product.productGroupId) {
    const assignments = await db
      .select({ taxRateId: productGroupTaxRates.taxRateId, periodStart: productGroupTaxRates.periodStart, periodEnd: productGroupTaxRates.periodEnd })
      .from(productGroupTaxRates)
      .where(and(eq(productGroupTaxRates.productGroupId, product.productGroupId), lte(productGroupTaxRates.periodStart, orderDate)));
    const applicable = assignments
      .filter((a) => !a.periodEnd || a.periodEnd >= orderDate)
      .sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1))[0];
    if (applicable) {
      const [taxRateRow] = await db.select({ rate: taxRates.rate }).from(taxRates).where(eq(taxRates.id, applicable.taxRateId)).limit(1);
      taxRate = taxRateRow ? Number(taxRateRow.rate) : null;
    }
  }

  return {
    cost_amount: product.costAmount ?? 0,
    bundle_insert_cost: product.bundleInsertCost ?? 0,
    shipping_cost: product.shippingCost ?? 0,
    sales_commission_amount: product.salesCommissionAmount ?? 0,
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
