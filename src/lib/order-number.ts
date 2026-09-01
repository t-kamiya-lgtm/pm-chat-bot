import { and, count, eq, gte, isNull, lt } from "drizzle-orm";
import { orders, scenarios } from "@/db/schema";
import type { Db } from "@/lib/db";

const DEFAULT_ORDER_CODE = "XX";

/**
 * 注文番号(シナリオの注文番号コード + 日付8桁 + 時間2桁 + その時間内の連番3桁)を生成する。
 * シナリオに注文番号コードが未設定の場合はデフォルトコードを使う。
 * 連番は同一シナリオ・同一時間帯の既存注文数から算出する簡易採番のため、
 * 極めて稀な同時アクセスでは重複しうる(注文番号はDB上の一意キーではない)。
 */
export async function generateOrderNumber(db: Db, scenarioId: string | null | undefined): Promise<string> {
  let orderCode = DEFAULT_ORDER_CODE;
  if (scenarioId) {
    const [scenario] = await db
      .select({ orderCode: scenarios.orderCode })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId))
      .limit(1);
    if (scenario?.orderCode) orderCode = scenario.orderCode;
  }

  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const hourPart = String(now.getHours()).padStart(2, "0");

  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

  const scenarioCondition = scenarioId ? eq(orders.scenarioId, scenarioId) : isNull(orders.scenarioId);
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(gte(orders.createdAt, hourStart.toISOString()), lt(orders.createdAt, hourEnd.toISOString()), scenarioCondition));
  const seq = String(total + 1).padStart(3, "0");

  return `${orderCode}${datePart}${hourPart}${seq}`;
}
