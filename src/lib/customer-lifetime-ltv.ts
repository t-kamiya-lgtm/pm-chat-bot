import { orderRevenue } from "@/lib/dashboard-aggregate";
import { incrementalProfit, type IncrementalProfitFields } from "@/lib/order-cost-snapshot";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** お届け頻度(日数換算)ごとの、年間LTVとみなす到達回数。 */
const TARGET_CYCLES_BY_INTERVAL_DAYS: Record<number, number> = {
  14: 24, // 2週間ごと
  30: 12, // 1ヶ月ごと
  60: 6, // 2ヶ月ごと
};
const KNOWN_INTERVAL_DAYS = Object.keys(TARGET_CYCLES_BY_INTERVAL_DAYS).map(Number);
const DEFAULT_INTERVAL_DAYS = 30;

function nearestKnownIntervalDays(observedDays: number): number {
  return KNOWN_INTERVAL_DAYS.reduce((closest, d) => (Math.abs(observedDays - d) < Math.abs(observedDays - closest) ? d : closest));
}

export interface LifetimeLtvOrderRow extends IncrementalProfitFields {
  id: string;
  customer_id: string;
  created_at: string;
  type: "one_time" | "subscription";
  billing_cycle_number: number;
}

export interface LifetimeAnnualLtv {
  /** 蓄積実績の対象になった全顧客数(1件でも確定注文がある顧客)。 */
  lifetimeCustomerCount: number;
  /** 生涯LTV(売上) = 全顧客の生涯売上合計 ÷ 全顧客数。 */
  lifetimeRevenueLtv: number;
  /** 生涯LTV(増分利益) = 全顧客の生涯増分利益合計 ÷ 全顧客数(コストスナップショットの無い注文は0円扱い)。 */
  lifetimeIncrementalProfitLtv: number;
  /** 年間LTVが確定した顧客数。 */
  annualCustomerCount: number;
  /** 年間LTV(売上)。算出方法は下記コメントを参照。 */
  annualRevenueLtv: number;
  /** 年間LTV(増分利益)。算出方法は売上と同じ。 */
  annualIncrementalProfitLtv: number;
}

/**
 * 定期契約者の「獲得時のお届け頻度」を求める。途中でお届け頻度を変更した顧客がいても、
 * 変更後の頻度に引きずられないよう、実測できる場合は初回→2回目の実際の間隔(日数)から
 * 逆算する(subscriptionsテーブルのintervalは変更のたびに上書きされる現在値のため、
 * 頻度変更後は獲得時の値を保持していない)。まだ2回目に到達していない顧客は、
 * 現時点のintervalByOrderId(=変更されていなければ獲得時のままのはず)で代用する。
 */
function resolveAcquisitionIntervalDays(
  subscriptionOrdersSorted: LifetimeLtvOrderRow[],
  intervalByOrderId: Map<string, string>,
  intervalDaysByLabel: Record<string, number>,
): number {
  if (subscriptionOrdersSorted.length >= 2) {
    const gapDays =
      (new Date(subscriptionOrdersSorted[1].created_at).getTime() - new Date(subscriptionOrdersSorted[0].created_at).getTime()) /
      MS_PER_DAY;
    return nearestKnownIntervalDays(gapDays);
  }
  const firstOrder = subscriptionOrdersSorted[0];
  const intervalLabel = firstOrder ? intervalByOrderId.get(firstOrder.id) : undefined;
  return (intervalLabel && intervalDaysByLabel[intervalLabel]) || DEFAULT_INTERVAL_DAYS;
}

/**
 * 全顧客の生涯LTVと、獲得時のお届け頻度に応じた年間LTV(1ヶ月ごと=12回、2ヶ月ごと=6回、
 * 2週間ごと=24回到達時点)を算出する。年間LTVは、その到達回数分の期間(頻度の日数×回数)を
 * 超えて経過した顧客のみを対象人数・合計の両方に含め(13ヶ月目以降の実績で更新しない、
 * 単品のみの顧客は暦日365日で代用)、未到達の顧客は対象外(翌月以降、到達した時点で
 * 自動的に加わる)。
 */
export function buildLifetimeAndAnnualLtv(
  orders: LifetimeLtvOrderRow[],
  asOfIso: string,
  intervalByOrderId: Map<string, string>,
  intervalDaysByLabel: Record<string, number>,
): LifetimeAnnualLtv {
  const byCustomer = new Map<string, LifetimeLtvOrderRow[]>();
  for (const o of orders) {
    if (!byCustomer.has(o.customer_id)) byCustomer.set(o.customer_id, []);
    byCustomer.get(o.customer_id)!.push(o);
  }

  const asOfMs = new Date(asOfIso).getTime();

  let lifetimeCustomerCount = 0;
  let lifetimeRevenueTotal = 0;
  let lifetimeIncrementalProfitTotal = 0;
  let annualCustomerCount = 0;
  let annualRevenueTotal = 0;
  let annualIncrementalProfitTotal = 0;

  for (const custOrders of byCustomer.values()) {
    const sorted = [...custOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    lifetimeCustomerCount += 1;
    lifetimeRevenueTotal += sorted.reduce((sum, o) => sum + orderRevenue(o), 0);
    lifetimeIncrementalProfitTotal += sorted.reduce((sum, o) => sum + (incrementalProfit(o) ?? 0), 0);

    const subscriptionOrdersSorted = sorted.filter((o) => o.type === "subscription");
    const firstOrderMs = new Date(sorted[0].created_at).getTime();

    let windowDays: number;
    if (subscriptionOrdersSorted.length > 0) {
      const intervalDays = resolveAcquisitionIntervalDays(subscriptionOrdersSorted, intervalByOrderId, intervalDaysByLabel);
      const targetCycles = TARGET_CYCLES_BY_INTERVAL_DAYS[intervalDays] ?? 12;
      windowDays = intervalDays * targetCycles;
    } else {
      // 単品のみの顧客にはお届け頻度が無いため、暦日365日を「年間」の目安として使う。
      windowDays = 365;
    }

    const daysSinceFirst = (asOfMs - firstOrderMs) / MS_PER_DAY;
    if (daysSinceFirst < windowDays) continue;

    const cutoffMs = firstOrderMs + windowDays * MS_PER_DAY;
    const withinWindow = sorted.filter((o) => new Date(o.created_at).getTime() <= cutoffMs);
    annualCustomerCount += 1;
    annualRevenueTotal += withinWindow.reduce((sum, o) => sum + orderRevenue(o), 0);
    annualIncrementalProfitTotal += withinWindow.reduce((sum, o) => sum + (incrementalProfit(o) ?? 0), 0);
  }

  return {
    lifetimeCustomerCount,
    lifetimeRevenueLtv: lifetimeCustomerCount > 0 ? lifetimeRevenueTotal / lifetimeCustomerCount : 0,
    lifetimeIncrementalProfitLtv: lifetimeCustomerCount > 0 ? lifetimeIncrementalProfitTotal / lifetimeCustomerCount : 0,
    annualCustomerCount,
    annualRevenueLtv: annualCustomerCount > 0 ? annualRevenueTotal / annualCustomerCount : 0,
    annualIncrementalProfitLtv: annualCustomerCount > 0 ? annualIncrementalProfitTotal / annualCustomerCount : 0,
  };
}
