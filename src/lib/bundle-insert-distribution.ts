import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { orders, productGroups, products } from "@/db/schema";
import type { Db } from "@/lib/db";

const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"] as const;

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
export async function countDistributedOrders(db: Db, target: DistributionCountTarget): Promise<number> {
  let productIds = target.targetProductIds;
  if (!productIds) {
    const groups = await db.select({ id: productGroups.id }).from(productGroups).where(eq(productGroups.brandId, target.brandId));
    const groupIds = groups.map((g) => g.id);
    if (groupIds.length === 0) return 0;
    const productRows = await db.select({ id: products.id }).from(products).where(inArray(products.productGroupId, groupIds));
    productIds = productRows.map((p) => p.id);
  }
  if (productIds.length === 0) return 0;

  const conditions = [
    inArray(orders.productId, productIds),
    inArray(orders.status, CONFIRMED_ORDER_STATUSES),
    gte(orders.createdAt, target.periodStart),
  ];
  if (target.periodEnd) conditions.push(lt(orders.createdAt, nextDay(target.periodEnd)));
  if (target.targetOrderType !== "both") conditions.push(eq(orders.type, target.targetOrderType));
  if (target.targetCycleNumbers) conditions.push(inArray(orders.billingCycleNumber, target.targetCycleNumbers));

  const [{ value }] = await db.select({ value: count() }).from(orders).where(and(...conditions));
  return value;
}
