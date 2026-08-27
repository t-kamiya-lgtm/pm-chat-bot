import { orderRevenue } from "@/lib/dashboard-aggregate";
import { incrementalProfit, type IncrementalProfitFields } from "@/lib/order-cost-snapshot";

const ANNUAL_WINDOW_DAYS = 365;

export interface LifetimeLtvOrderRow extends IncrementalProfitFields {
  customer_id: string;
  created_at: string;
}

export interface LifetimeAnnualLtv {
  /** 蓄積実績の対象になった全顧客数(1件でも確定注文がある顧客)。 */
  lifetimeCustomerCount: number;
  /** 生涯LTV(売上) = 全顧客の生涯売上合計 ÷ 全顧客数。 */
  lifetimeRevenueLtv: number;
  /** 生涯LTV(増分利益) = 全顧客の生涯増分利益合計 ÷ 全顧客数(コストスナップショットの無い注文は0円扱い)。 */
  lifetimeIncrementalProfitLtv: number;
  /** 獲得から365日以上経過し、12ヶ月LTVが確定した顧客数。 */
  annualCustomerCount: number;
  /** 12ヶ月LTV(売上) = 各顧客の獲得日から365日以内の売上合計の平均(獲得後13ヶ月目以降の実績は含めない)。 */
  annualRevenueLtv: number;
  /** 12ヶ月LTV(増分利益)。算出方法は売上と同じ。 */
  annualIncrementalProfitLtv: number;
}

/**
 * 全顧客の生涯LTVと、獲得から365日時点で確定する12ヶ月LTVを算出する。
 * 12ヶ月LTVは獲得日+365日以内の実績のみを積算し(13ヶ月目以降の実績では更新しない)、
 * 獲得からまだ365日経っていない顧客は対象人数・合計のどちらにも含めない
 * (翌月以降、新たに365日に到達した時点で自動的に対象に加わる)。
 */
export function buildLifetimeAndAnnualLtv(orders: LifetimeLtvOrderRow[], asOfIso: string): LifetimeAnnualLtv {
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

    const firstOrderMs = new Date(sorted[0].created_at).getTime();
    const daysSinceFirst = (asOfMs - firstOrderMs) / (24 * 60 * 60 * 1000);
    if (daysSinceFirst < ANNUAL_WINDOW_DAYS) continue;

    const cutoffMs = firstOrderMs + ANNUAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const withinYear = sorted.filter((o) => new Date(o.created_at).getTime() <= cutoffMs);
    annualCustomerCount += 1;
    annualRevenueTotal += withinYear.reduce((sum, o) => sum + orderRevenue(o), 0);
    annualIncrementalProfitTotal += withinYear.reduce((sum, o) => sum + (incrementalProfit(o) ?? 0), 0);
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
