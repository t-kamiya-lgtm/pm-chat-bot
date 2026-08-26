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

export function aggregateByScenario(
  accessLogs: AccessLogRow[],
  orders: OrderRow[],
  scenarioNames: Record<string, string>,
) {
  return aggregateBy(
    accessLogs,
    orders,
    (row) => row.scenario_id ?? "",
    (row) => (row.scenario_id ? (scenarioNames[row.scenario_id] ?? "(削除済みシナリオ)") : "(シナリオ不明)"),
  );
}

/** 商品はアクセスログに紐付かないため、注文のみを商品別に集計する。 */
export function aggregateByProduct(orders: OrderRow[], productNames: Record<string, string>) {
  const table = new Map<string, { label: string; stats: Stats }>();
  for (const order of orders) {
    const key = order.product_id;
    let entry = table.get(key);
    if (!entry) {
      entry = { label: productNames[key] ?? "(削除済み商品)", stats: emptyStats() };
      table.set(key, entry);
    }
    entry.stats.purchaseCount += 1;
    entry.stats.revenue += orderRevenue(order);
  }
  return Array.from(table.entries())
    .map(([key, { label, stats }]) => ({ key, label, stats: withConversion(stats) }))
    .sort((a, b) => b.stats.revenue - a.stats.revenue);
}

/** 日付(YYYY-MM-DD, JST)ごとの推移。 */
export function aggregateByDate(accessLogs: AccessLogRow[], orders: OrderRow[]) {
  function dateKey(iso: string): string {
    return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  }
  return aggregateBy(accessLogs, orders, (row) => dateKey(row.created_at), (row) => dateKey(row.created_at)).sort(
    (a, b) => (a.key < b.key ? 1 : -1),
  );
}

export function totalStats(accessLogs: AccessLogRow[], orders: OrderRow[]): StatsWithConversion {
  const stats = emptyStats();
  stats.accessCount = accessLogs.length;
  stats.purchaseCount = orders.length;
  stats.revenue = orders.reduce((sum, o) => sum + orderRevenue(o), 0);
  return withConversion(stats);
}
