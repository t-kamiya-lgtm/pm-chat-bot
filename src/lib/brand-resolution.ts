import { desc, eq } from "drizzle-orm";
import { brands, orders, scenarios } from "@/db/schema";
import type { Db } from "@/lib/db";

/** シナリオコード(英字2文字+数字4桁)の先頭2文字とブランドコードを突き合わせてブランドを判定する。 */
export function resolveScenarioBrandId(
  orderCode: string | null,
  brandCodeToId: Map<string, string>,
): string | null {
  if (!orderCode || orderCode.length < 2) return null;
  return brandCodeToId.get(orderCode.slice(0, 2).toUpperCase()) ?? null;
}

/**
 * 指定した顧客の直近の注文(シナリオ)から、所属ブランドを推定する。
 * 複数ブランドの注文履歴がある顧客は、最新の注文を優先する。
 */
export async function resolveCustomerBrandId(db: Db, customerId: string): Promise<string | null> {
  const brandRows = await db.select({ id: brands.id, code: brands.code }).from(brands);
  const brandCodeToId = new Map(
    brandRows.filter((b) => b.code).map((b) => [b.code!.toUpperCase(), b.id]),
  );
  if (brandCodeToId.size === 0) return null;

  const orderRows = await db
    .select({ orderCode: scenarios.orderCode })
    .from(orders)
    .leftJoin(scenarios, eq(orders.scenarioId, scenarios.id))
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  for (const order of orderRows) {
    const brandId = resolveScenarioBrandId(order.orderCode ?? null, brandCodeToId);
    if (brandId) return brandId;
  }
  return null;
}
