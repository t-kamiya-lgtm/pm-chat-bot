export interface AccessLogRow {
  scenario_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
}

export interface OrderRow {
  scenario_id: string | null;
  product_id: string;
  amount: number;
  addon_amount: number | null;
  discount_amount: number | null;
  first_time_discount_amount: number | null;
  shipping_fee: number;
  payment_fee: number;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  /** 1=新規(単品または定期初回)、2以上=定期の継続分。 */
  billing_cycle_number: number;
}

/** アクセスログ・注文の両方が共通して持つ、集計キーの元になるフィールド。 */
type TaggedRow = Pick<AccessLogRow, "scenario_id" | "utm_source" | "utm_medium" | "utm_campaign" | "created_at">;

export const NO_AD_LABEL = "その他・直接流入";

/** UTMパラメータの組から表示用の広告ラベルを作る。全て未設定の場合は直接流入扱いにまとめる。 */
export function adLabel(utmSource: string | null, utmMedium: string | null, utmCampaign: string | null): string {
  const parts = [utmSource, utmMedium, utmCampaign].filter((v): v is string => Boolean(v));
  return parts.length > 0 ? parts.join(" / ") : NO_AD_LABEL;
}

function adKey(utmSource: string | null, utmMedium: string | null, utmCampaign: string | null): string {
  return `${utmSource ?? ""} ${utmMedium ?? ""} ${utmCampaign ?? ""}`;
}

interface OrderMoneyFields {
  amount: number;
  addon_amount: number | null;
  shipping_fee: number;
  payment_fee: number;
  discount_amount: number | null;
  first_time_discount_amount: number | null;
}

/** アドオン加算・値引反映後の請求額(スマレジ連携・CSV出力と同じ計算式)。 */
export function orderRevenue(order: OrderMoneyFields): number {
  return (
    order.amount +
    (order.addon_amount ?? 0) +
    order.shipping_fee +
    order.payment_fee -
    (order.discount_amount ?? 0) -
    (order.first_time_discount_amount ?? 0)
  );
}

export interface Stats {
  accessCount: number;
  purchaseCount: number;
  revenue: number;
}

function emptyStats(): Stats {
  return { accessCount: 0, purchaseCount: 0, revenue: 0 };
}

export interface StatsWithConversion extends Stats {
  conversionRate: number | null;
}

function withConversion(stats: Stats): StatsWithConversion {
  return {
    ...stats,
    conversionRate: stats.accessCount > 0 ? stats.purchaseCount / stats.accessCount : null,
  };
}

/** アクセスログ・注文一覧から、グルーピングキー別の集計テーブルを組み立てる。 */
function aggregateBy(
  accessLogs: TaggedRow[],
  orders: (TaggedRow & OrderMoneyFields)[],
  keyOf: (row: TaggedRow) => string,
  labelOf: (row: TaggedRow) => string,
): { key: string; label: string; stats: StatsWithConversion }[] {
  const table = new Map<string, { label: string; stats: Stats }>();

  function bucket(row: TaggedRow) {
    const key = keyOf(row);
    let entry = table.get(key);
    if (!entry) {
      entry = { label: labelOf(row), stats: emptyStats() };
      table.set(key, entry);
    }
    return entry;
  }

  for (const log of accessLogs) bucket(log).stats.accessCount += 1;
  for (const order of orders) {
    const entry = bucket(order);
    entry.stats.purchaseCount += 1;
    entry.stats.revenue += orderRevenue(order);
  }

  return Array.from(table.entries())
    .map(([key, { label, stats }]) => ({ key, label, stats: withConversion(stats) }))
    .sort((a, b) => b.stats.accessCount - a.stats.accessCount || b.stats.revenue - a.stats.revenue);
}

export function aggregateByAd(accessLogs: AccessLogRow[], orders: OrderRow[]) {
  return aggregateBy(
    accessLogs,
    orders,
    (row) => adKey(row.utm_source, row.utm_medium, row.utm_campaign),
    (row) => adLabel(row.utm_source, row.utm_medium, row.utm_campaign),
  );
}

export function totalStats(accessLogs: AccessLogRow[], orders: OrderRow[]): StatsWithConversion {
  const stats = emptyStats();
  stats.accessCount = accessLogs.length;
  stats.purchaseCount = orders.length;
  stats.revenue = orders.reduce((sum, o) => sum + orderRevenue(o), 0);
  return withConversion(stats);
}

/**
 * 新規(billing_cycle_number=1)/継続(2以上)を分けて集計する統計。
 * CVR・平均単価は新規購入(アクセスから生まれた注文)についてのみ算出する
 * (継続分は既存顧客のリピートで、新規のアクセスに起因しないため)。
 */
export interface SplitStats {
  accessCount: number;
  newPurchaseCount: number;
  newRevenue: number;
  continuingPurchaseCount: number;
  continuingRevenue: number;
}

function emptySplitStats(): SplitStats {
  return { accessCount: 0, newPurchaseCount: 0, newRevenue: 0, continuingPurchaseCount: 0, continuingRevenue: 0 };
}

export interface SplitStatsWithDerived extends SplitStats {
  conversionRate: number | null;
  avgUnitPrice: number | null;
  totalRevenue: number;
}

function withSplitDerived(stats: SplitStats): SplitStatsWithDerived {
  return {
    ...stats,
    conversionRate: stats.accessCount > 0 ? stats.newPurchaseCount / stats.accessCount : null,
    avgUnitPrice: stats.newPurchaseCount > 0 ? stats.newRevenue / stats.newPurchaseCount : null,
    totalRevenue: stats.newRevenue + stats.continuingRevenue,
  };
}

type SplitRow = { key: string; label: string; stats: SplitStatsWithDerived };

function aggregateSplitBy(
  accessLogs: TaggedRow[],
  orders: (TaggedRow & OrderMoneyFields & { billing_cycle_number: number })[],
  keyOf: (row: TaggedRow) => string,
  labelOf: (row: TaggedRow) => string,
): SplitRow[] {
  const table = new Map<string, { label: string; stats: SplitStats }>();

  function bucket(row: TaggedRow) {
    const key = keyOf(row);
    let entry = table.get(key);
    if (!entry) {
      entry = { label: labelOf(row), stats: emptySplitStats() };
      table.set(key, entry);
    }
    return entry;
  }

  for (const log of accessLogs) bucket(log).stats.accessCount += 1;
  for (const order of orders) {
    const entry = bucket(order);
    const revenue = orderRevenue(order);
    if (order.billing_cycle_number > 1) {
      entry.stats.continuingPurchaseCount += 1;
      entry.stats.continuingRevenue += revenue;
    } else {
      entry.stats.newPurchaseCount += 1;
      entry.stats.newRevenue += revenue;
    }
  }

  return Array.from(table.entries())
    .map(([key, { label, stats }]) => ({ key, label, stats: withSplitDerived(stats) }))
    .sort((a, b) => b.stats.totalRevenue - a.stats.totalRevenue);
}

export function aggregateByScenarioSplit(
  accessLogs: AccessLogRow[],
  orders: OrderRow[],
  scenarioNames: Record<string, string>,
): SplitRow[] {
  return aggregateSplitBy(
    accessLogs,
    orders,
    (row) => row.scenario_id ?? "",
    (row) => (row.scenario_id ? (scenarioNames[row.scenario_id] ?? "(削除済みシナリオ)") : "(シナリオ不明)"),
  ).sort((a, b) => b.stats.accessCount - a.stats.accessCount || b.stats.totalRevenue - a.stats.totalRevenue);
}

/** 商品はアクセスログに紐付かないため、注文のみを商品別に集計する。 */
export function aggregateByProductSplit(
  orders: OrderRow[],
  productNames: Record<string, string>,
): SplitRow[] {
  const table = new Map<string, { label: string; stats: SplitStats }>();
  for (const order of orders) {
    const key = order.product_id;
    let entry = table.get(key);
    if (!entry) {
      entry = { label: productNames[key] ?? "(削除済み商品)", stats: emptySplitStats() };
      table.set(key, entry);
    }
    const revenue = orderRevenue(order);
    if (order.billing_cycle_number > 1) {
      entry.stats.continuingPurchaseCount += 1;
      entry.stats.continuingRevenue += revenue;
    } else {
      entry.stats.newPurchaseCount += 1;
      entry.stats.newRevenue += revenue;
    }
  }
  return Array.from(table.entries())
    .map(([key, { label, stats }]) => ({ key, label, stats: withSplitDerived(stats) }))
    .sort((a, b) => b.stats.totalRevenue - a.stats.totalRevenue);
}

function dateKeyJst(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** 日付(YYYY-MM-DD, JST)ごとの推移(新規/継続分けあり)。 */
export function aggregateByDateSplit(accessLogs: AccessLogRow[], orders: OrderRow[]): SplitRow[] {
  return aggregateSplitBy(accessLogs, orders, (row) => dateKeyJst(row.created_at), (row) => dateKeyJst(row.created_at)).sort(
    (a, b) => (a.key < b.key ? 1 : -1),
  );
}

export interface PivotTable {
  rowLabels: string[];
  dateColumns: string[];
  countMatrix: Record<string, Record<string, number>>;
  revenueMatrix: Record<string, Record<string, number>>;
}

function allDatesInRange(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00+09:00`);
  const end = new Date(`${dateTo}T00:00:00+09:00`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** 行(商品名・シナリオ名など)×日付の件数・売上マトリクスを組み立てる。 */
export function buildPivotTable<T extends OrderMoneyFields & { created_at: string }>(
  orders: T[],
  rowKeyOf: (order: T) => string,
  rowLabelOf: (order: T) => string,
  dateFrom: string,
  dateTo: string,
): PivotTable {
  const dateColumns = allDatesInRange(dateFrom, dateTo);
  const rowLabelByKey = new Map<string, string>();
  const countMatrix: Record<string, Record<string, number>> = {};
  const revenueMatrix: Record<string, Record<string, number>> = {};

  for (const order of orders) {
    const key = rowKeyOf(order);
    if (!rowLabelByKey.has(key)) rowLabelByKey.set(key, rowLabelOf(order));
    const label = rowLabelByKey.get(key)!;
    const date = dateKeyJst(order.created_at);
    if (!countMatrix[label]) countMatrix[label] = {};
    if (!revenueMatrix[label]) revenueMatrix[label] = {};
    countMatrix[label][date] = (countMatrix[label][date] ?? 0) + 1;
    revenueMatrix[label][date] = (revenueMatrix[label][date] ?? 0) + orderRevenue(order);
  }

  const rowLabels = Array.from(rowLabelByKey.values()).sort((a, b) => a.localeCompare(b, "ja"));
  return { rowLabels, dateColumns, countMatrix, revenueMatrix };
}
