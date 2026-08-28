import { orderRevenue, normalizeReferrer } from "@/lib/dashboard-aggregate";
import { resolveScenarioBrandId } from "@/lib/brand-resolution";
import { incrementalProfit } from "@/lib/order-cost-snapshot";

export interface LtvOrderRow {
  id: string;
  customer_id: string;
  scenario_id: string | null;
  product_id: string;
  type: "one_time" | "subscription";
  payment_method: string;
  billing_cycle_number: number;
  quantity: number;
  amount: number;
  addon_amount: number | null;
  discount_amount: number | null;
  first_time_discount_amount: number | null;
  shipping_fee: number;
  payment_fee: number;
  created_at: string;
  session_id: string | null;
  cost_amount: number | null;
  bundle_insert_cost: number | null;
  shipping_cost: number | null;
  sales_commission_amount: number | null;
}

export interface LtvCustomerRow {
  id: string;
  gender: string | null;
  birth_date: string | null;
}

export interface BundleSetCriteria {
  id: string;
  name: string;
  brand_id: string;
  period_start: string;
  period_end: string | null;
  target_order_type: "subscription" | "one_time" | "both";
  target_cycle_numbers: number[] | null;
  target_product_ids: string[] | null;
}

export interface SegmentContext {
  scenarioNames: Map<string, string>;
  scenarioOrderCodes: Map<string, string | null>;
  brandCodeToId: Map<string, string>;
  brandNames: Map<string, string>;
  productNames: Map<string, string>;
  referrerBySessionId: Map<string, string | null>;
  intervalByOrderId: Map<string, string>;
  bundleSets: BundleSetCriteria[];
  customerIdsWithRetentionAction: Set<string>;
}

export const SEGMENT_AXES = [
  { key: "scenario", label: "シナリオ" },
  { key: "brand", label: "ブランド" },
  { key: "referrer", label: "流入元(LP)" },
  { key: "firstProduct", label: "初回商品(オファー)" },
  { key: "bundleSet", label: "同梱物セット" },
  { key: "paymentMethod", label: "決済方法" },
  { key: "interval", label: "お届け頻度" },
  { key: "gender", label: "性別" },
  { key: "ageBand", label: "年代" },
  { key: "retentionAction", label: "継続施策" },
] as const;

export type SegmentAxis = (typeof SEGMENT_AXES)[number]["key"];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: "即時決済(Stripe)",
  deferred_invoice: "後払い",
  cod: "代金引換",
};

const INTERVAL_LABELS: Record<string, string> = {
  biweekly: "2週間ごと",
  monthly: "1ヶ月ごと",
  bimonthly: "2ヶ月ごと",
};

function ageBandOf(birthDate: string | null, atIso: string): string {
  if (!birthDate) return "不明";
  const birth = new Date(birthDate);
  const at = new Date(atIso);
  let age = at.getFullYear() - birth.getFullYear();
  const monthDiff = at.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < birth.getDate())) age -= 1;
  if (age < 0) return "不明";
  if (age < 20) return "10代以下";
  if (age >= 70) return "70代以上";
  return `${Math.floor(age / 10) * 10}代`;
}

/** その注文の日付・回数・商品・種別が、ブランドの同梱物セットの対象条件に合致するか判定する。 */
function matchBundleSet(order: LtvOrderRow, brandId: string | null, sets: BundleSetCriteria[]): string {
  if (!brandId) return "対象外";
  const orderDate = order.created_at.slice(0, 10);
  const match = sets.find(
    (s) =>
      s.brand_id === brandId &&
      orderDate >= s.period_start &&
      (!s.period_end || orderDate <= s.period_end) &&
      (s.target_order_type === "both" || s.target_order_type === order.type) &&
      (!s.target_cycle_numbers || s.target_cycle_numbers.includes(order.billing_cycle_number)) &&
      (!s.target_product_ids || s.target_product_ids.includes(order.product_id)),
  );
  return match ? match.name : "対象外";
}

function resolveBrandId(order: LtvOrderRow, ctx: SegmentContext): string | null {
  const orderCode = order.scenario_id ? (ctx.scenarioOrderCodes.get(order.scenario_id) ?? null) : null;
  return resolveScenarioBrandId(orderCode, ctx.brandCodeToId);
}

/** 指定した軸で、代表となる1件の注文からセグメントの表示ラベルを求める。 */
export function resolveSegmentLabel(
  axis: SegmentAxis,
  order: LtvOrderRow,
  customer: LtvCustomerRow,
  ctx: SegmentContext,
): string {
  switch (axis) {
    case "scenario":
      return order.scenario_id ? (ctx.scenarioNames.get(order.scenario_id) ?? "(シナリオ不明)") : "(シナリオ不明)";
    case "brand": {
      const brandId = resolveBrandId(order, ctx);
      return brandId ? (ctx.brandNames.get(brandId) ?? "(ブランド不明)") : "(ブランド不明)";
    }
    case "referrer":
      return normalizeReferrer(order.session_id ? (ctx.referrerBySessionId.get(order.session_id) ?? null) : null);
    case "firstProduct":
      return ctx.productNames.get(order.product_id) ?? "(削除済み商品)";
    case "bundleSet":
      return matchBundleSet(order, resolveBrandId(order, ctx), ctx.bundleSets);
    case "paymentMethod":
      return PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method;
    case "interval": {
      if (order.type !== "subscription") return "(単品)";
      const interval = ctx.intervalByOrderId.get(order.id);
      return interval ? (INTERVAL_LABELS[interval] ?? interval) : "(不明)";
    }
    case "gender":
      return customer.gender || "未回答";
    case "ageBand":
      return ageBandOf(customer.birth_date, order.created_at);
    case "retentionAction":
      return ctx.customerIdsWithRetentionAction.has(customer.id) ? "実施あり" : "実施なし";
    default:
      return "(不明)";
  }
}

/** 複数のセグメント軸を組み合わせたラベル(例:「シナリオ名 × LP名 × オファー名」)。 */
function resolveCombinedSegmentLabel(
  axes: SegmentAxis[],
  order: LtvOrderRow,
  customer: LtvCustomerRow,
  ctx: SegmentContext,
): string {
  return axes.map((axis) => resolveSegmentLabel(axis, order, customer, ctx)).join(" × ");
}

export function resolveLabel(
  axis: SegmentAxis | SegmentAxis[],
  order: LtvOrderRow,
  customer: LtvCustomerRow,
  ctx: SegmentContext,
): string {
  return Array.isArray(axis) ? resolveCombinedSegmentLabel(axis, order, customer, ctx) : resolveSegmentLabel(axis, order, customer, ctx);
}

export interface CustomerLtvProfile {
  customerId: string;
  firstOrder: LtvOrderRow;
  firstSubOrder: LtvOrderRow | null;
  subscriptionRevenue: number;
  lifetimeRevenue: number;
  isSubscriber: boolean;
  /** 継続回数(この顧客の定期注文の件数=請求された周期数)。 */
  subscriptionCycleCount: number;
  /** 定期注文の数量合計(1回あたりの平均購入点数の算出に使う)。 */
  subscriptionQuantityTotal: number;
  /**
   * 全注文(定期+単品)の広告費除く増分利益の合計。コストスナップショットの無い
   * (導入前の)注文は0円として扱う(除外ではなく合算しない)ため、導入前の注文が
   * 混在する顧客は実際より少なく計上される点に注意。
   */
  totalIncrementalProfit: number;
}

/**
 * 確定済み注文を顧客ごとにまとめ、定期LTV(定期関連売上)と売上LTV(単品含む全売上)、
 * 初回注文・初回定期注文を求める。「案A」の設計に基づき、単品購入は回数(billing_cycle_number)
 * の系列には影響させず、独立した指標(単品→定期引き上げ率)として扱う。
 */
export function buildCustomerProfiles(orders: LtvOrderRow[]): CustomerLtvProfile[] {
  const byCustomer = new Map<string, LtvOrderRow[]>();
  for (const o of orders) {
    if (!byCustomer.has(o.customer_id)) byCustomer.set(o.customer_id, []);
    byCustomer.get(o.customer_id)!.push(o);
  }

  const profiles: CustomerLtvProfile[] = [];
  for (const [customerId, custOrders] of byCustomer) {
    const sorted = [...custOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstOrder = sorted[0];
    const subscriptionOrders = sorted.filter((o) => o.type === "subscription");
    const firstSubOrder = subscriptionOrders[0] ?? null;
    const subscriptionRevenue = subscriptionOrders.reduce((sum, o) => sum + orderRevenue(o), 0);
    const lifetimeRevenue = sorted.reduce((sum, o) => sum + orderRevenue(o), 0);
    const totalIncrementalProfit = sorted.reduce((sum, o) => sum + (incrementalProfit(o) ?? 0), 0);
    profiles.push({
      customerId,
      firstOrder,
      firstSubOrder,
      subscriptionRevenue,
      lifetimeRevenue,
      isSubscriber: firstSubOrder !== null,
      subscriptionCycleCount: subscriptionOrders.length,
      subscriptionQuantityTotal: subscriptionOrders.reduce((sum, o) => sum + o.quantity, 0),
      totalIncrementalProfit,
    });
  }
  return profiles;
}

export interface LtvSegmentRow {
  segment: string;
  customerCount: number;
  /** 定期LTV = 定期契約者の定期関連売上合計 ÷ 定期契約者数。 */
  subscriptionLtv: number;
  /** 売上LTV = 同じ定期契約者集団の、単品購入分も含めた全売上合計 ÷ 定期契約者数(期間内合計)。 */
  revenueLtv: number;
  /** 継続回数(定期の請求周期数)の平均。 */
  avgCycleCount: number;
  /** 定期注文1回あたりの平均売上単価。 */
  avgOrderRevenue: number;
  /** 定期注文1回あたりの平均購入点数。 */
  avgQuantityPerOrder: number;
  /** 広告費除く増分利益の合計(コストスナップショットの無い注文は0円扱い)。 */
  totalIncrementalProfit: number;
  /** 増分利益LTV = 期間合計増分利益 ÷ 定期契約者数。 */
  incrementalProfitLtv: number;
}

/**
 * セグメント別LTVランキング(定期契約者のみが対象、期間内に存在した全件を表示する)。
 * 定期LTV = そのセグメントの定期契約者の定期関連売上合計 ÷ 定期契約者数。
 * 売上LTV(旧:顧客生涯LTV(単品含む))は同じ定期契約者集団について、単品購入分も
 * 含めた全売上を使う(単品購入の有無で定期LTV自体は変わらない)。
 */
export function buildLtvRanking(
  profiles: CustomerLtvProfile[],
  customersById: Map<string, LtvCustomerRow>,
  axis: SegmentAxis | SegmentAxis[],
  ctx: SegmentContext,
): LtvSegmentRow[] {
  const table = new Map<
    string,
    {
      count: number;
      subRevenue: number;
      lifeRevenue: number;
      cycleCountTotal: number;
      orderCountTotal: number;
      quantityTotal: number;
      incrementalProfitTotal: number;
    }
  >();
  for (const p of profiles) {
    if (!p.isSubscriber || !p.firstSubOrder) continue;
    const customer = customersById.get(p.customerId);
    if (!customer) continue;
    const label = resolveLabel(axis, p.firstSubOrder, customer, ctx);
    const entry = table.get(label) ?? {
      count: 0,
      subRevenue: 0,
      lifeRevenue: 0,
      cycleCountTotal: 0,
      orderCountTotal: 0,
      quantityTotal: 0,
      incrementalProfitTotal: 0,
    };
    entry.count += 1;
    entry.subRevenue += p.subscriptionRevenue;
    entry.lifeRevenue += p.lifetimeRevenue;
    entry.cycleCountTotal += p.subscriptionCycleCount;
    entry.orderCountTotal += p.subscriptionCycleCount;
    entry.quantityTotal += p.subscriptionQuantityTotal;
    entry.incrementalProfitTotal += p.totalIncrementalProfit;
    table.set(label, entry);
  }
  return Array.from(table.entries())
    .map(([segment, { count, subRevenue, lifeRevenue, cycleCountTotal, orderCountTotal, quantityTotal, incrementalProfitTotal }]) => ({
      segment,
      customerCount: count,
      subscriptionLtv: count > 0 ? subRevenue / count : 0,
      revenueLtv: count > 0 ? lifeRevenue / count : 0,
      avgCycleCount: count > 0 ? cycleCountTotal / count : 0,
      avgOrderRevenue: orderCountTotal > 0 ? subRevenue / orderCountTotal : 0,
      avgQuantityPerOrder: orderCountTotal > 0 ? quantityTotal / orderCountTotal : 0,
      totalIncrementalProfit: incrementalProfitTotal,
      incrementalProfitLtv: count > 0 ? incrementalProfitTotal / count : 0,
    }))
    .sort((a, b) => b.subscriptionLtv - a.subscriptionLtv);
}

export interface ConversionSegmentRow {
  segment: string;
  oneTimeBuyerCount: number;
  convertedCount: number;
  conversionRate: number | null;
}

/**
 * セグメント別・単品→定期引き上げ率(初回注文が単品だった顧客が対象)。
 * セグメントは初回注文自体の属性(初回に見たシナリオ・同梱された同梱物など)で判定する。
 */
export function buildConversionRanking(
  profiles: CustomerLtvProfile[],
  customersById: Map<string, LtvCustomerRow>,
  axis: SegmentAxis | SegmentAxis[],
  ctx: SegmentContext,
): ConversionSegmentRow[] {
  const table = new Map<string, { total: number; converted: number }>();
  for (const p of profiles) {
    if (p.firstOrder.type !== "one_time") continue;
    const customer = customersById.get(p.customerId);
    if (!customer) continue;
    const label = resolveLabel(axis, p.firstOrder, customer, ctx);
    const entry = table.get(label) ?? { total: 0, converted: 0 };
    entry.total += 1;
    if (p.isSubscriber) entry.converted += 1;
    table.set(label, entry);
  }
  return Array.from(table.entries())
    .map(([segment, { total, converted }]) => ({
      segment,
      oneTimeBuyerCount: total,
      convertedCount: converted,
      conversionRate: total > 0 ? converted / total : null,
    }))
    .sort((a, b) => (b.conversionRate ?? 0) - (a.conversionRate ?? 0));
}
