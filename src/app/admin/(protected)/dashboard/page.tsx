import { Fragment } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardViewToggle } from "@/components/admin/DashboardViewToggle";
import { SplitStatsViewToggle } from "@/components/admin/SplitStatsViewToggle";
import { PrintButton } from "@/components/admin/PrintButton";
import { CsvExportButton } from "@/components/admin/CsvExportButton";
import { StickyBelowHeader } from "@/components/admin/StickyBelowHeader";
import { TabbedPanels } from "@/components/admin/TabbedPanels";
import { CollapsibleFilterBar } from "@/components/admin/CollapsibleFilterBar";
import { resolveScenarioBrandId } from "@/lib/brand-resolution";
import {
  aggregateByAd,
  aggregateByDateSplit,
  aggregateByProductSplit,
  aggregateByReferrerSplit,
  aggregateByScenarioSplit,
  buildPivotTable,
  normalizeReferrer,
  orderRevenue,
  totalStats,
  type AccessLogRow,
  type OrderRow,
  type StatsWithConversion,
  type SplitStatsWithDerived,
} from "@/lib/dashboard-aggregate";

export const dynamic = "force-dynamic";

/** 実績が確定したとみなす注文ステータス(与信待ち・失敗・キャンセルは集計に含めない)。 */
const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];

function todayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function daysAgoJst(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function formatYen(amount: number): string {
  return `${amount.toLocaleString()}円`;
}

function formatRate(rate: number | null): string {
  return rate === null ? "-" : `${(rate * 100).toFixed(1)}%`;
}

/** ドリルダウン用に、注文の生データから追加で必要な顧客・注文IDを含めた行の型。 */
interface OrderRowWithCustomer extends OrderRow {
  id: string;
  customer_id: string;
}

interface DrilldownOrderRow {
  customerName: string;
  productLabel: string;
  revenue: number;
  dateLabel: string;
  kindLabel: string;
}

function kindLabelOf(o: { type: "one_time" | "subscription"; billing_cycle_number: number }): string {
  if (o.billing_cycle_number > 1) return "継続(定期)";
  return o.type === "subscription" ? "新規(定期)" : "新規(単品)";
}

/** 内訳表の各セグメント(キー)ごとに、行クリックで展開する生データ(顧客・商品・金額・日付・区分)を組み立てる。 */
function buildDrilldownByKey(
  orders: (OrderRowWithCustomer & { referrerLabel: string })[],
  keyOf: (o: OrderRowWithCustomer & { referrerLabel: string }) => string,
  customerNamesById: Map<string, string>,
  productNames: Record<string, string>,
): Map<string, DrilldownOrderRow[]> {
  const map = new Map<string, DrilldownOrderRow[]>();
  for (const o of orders) {
    const key = keyOf(o);
    const list = map.get(key) ?? [];
    list.push({
      customerName: customerNamesById.get(o.customer_id) ?? "(顧客不明)",
      productLabel: productNames[o.product_id] ?? "(削除済み商品)",
      revenue: orderRevenue(o),
      dateLabel: new Date(o.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
      kindLabel: kindLabelOf(o),
    });
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => (a.dateLabel < b.dateLabel ? 1 : -1));
  return map;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const getParam = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const dateFrom = getParam("dateFrom") || daysAgoJst(29);
  const dateTo = getParam("dateTo") || todayJst();
  const scenarioId = getParam("scenarioId") || "";
  const brandId = getParam("brandId") || "";

  const supabase = createSupabaseAdminClient();

  const [{ data: scenarios }, { data: products }, { data: brands }, { data: customers }] = await Promise.all([
    supabase.from("scenarios").select("id, name, order_code").order("display_order"),
    supabase.from("products").select("id, name"),
    supabase.from("brands").select("id, name, code").order("name"),
    supabase.from("customers").select("id, name"),
  ]);
  const scenarioNames = Object.fromEntries((scenarios ?? []).map((s) => [s.id, s.name]));
  const productNames = Object.fromEntries((products ?? []).map((p) => [p.id, p.name]));
  const customerNamesById = new Map(
    (customers ?? []).map((c) => [c.id as string, (c.name as string | null) || "(名称未設定)"]),
  );

  const brandCodeToId = new Map(
    (brands ?? []).filter((b) => b.code).map((b) => [(b.code as string).toUpperCase(), b.id as string]),
  );
  const scenarioIdsForBrand = brandId
    ? (scenarios ?? [])
        .filter((s) => resolveScenarioBrandId(s.order_code, brandCodeToId) === brandId)
        .map((s) => s.id)
    : null;

  // ブランド絞り込み時、該当シナリオが1件もなければ以降のクエリを空扱いにする(空配列.inは全件ヒットしてしまうため)。
  const brandFilterYieldsNoResults = scenarioIdsForBrand !== null && scenarioIdsForBrand.length === 0;

  let accessQuery = supabase
    .from("scenario_access_logs")
    .select("scenario_id, session_id, utm_source, utm_medium, utm_campaign, referrer, created_at")
    .gte("created_at", `${dateFrom}T00:00:00+09:00`)
    .lte("created_at", `${dateTo}T23:59:59+09:00`);
  if (scenarioId) accessQuery = accessQuery.eq("scenario_id", scenarioId);
  if (scenarioIdsForBrand) accessQuery = accessQuery.in("scenario_id", scenarioIdsForBrand);
  const { data: accessLogs, error: accessError } = brandFilterYieldsNoResults
    ? { data: [], error: null }
    : await accessQuery;

  let orderQuery = supabase
    .from("orders")
    .select(
      "id, customer_id, scenario_id, product_id, type, amount, addon_amount, discount_amount, first_time_discount_amount, shipping_fee, payment_fee, utm_source, utm_medium, utm_campaign, created_at, billing_cycle_number, session_id, cost_amount, bundle_insert_cost, shipping_cost, sales_commission_amount",
    )
    .in("status", CONFIRMED_ORDER_STATUSES)
    .gte("created_at", `${dateFrom}T00:00:00+09:00`)
    .lte("created_at", `${dateTo}T23:59:59+09:00`);
  if (scenarioId) orderQuery = orderQuery.eq("scenario_id", scenarioId);
  if (scenarioIdsForBrand) orderQuery = orderQuery.in("scenario_id", scenarioIdsForBrand);
  const { data: orders, error: ordersError } = brandFilterYieldsNoResults
    ? { data: [], error: null }
    : await orderQuery;

  const accessLogRows: AccessLogRow[] = accessLogs ?? [];
  const orderRows: OrderRowWithCustomer[] = (orders ?? []) as unknown as OrderRowWithCustomer[];

  // 注文自体にはreferrerを保存していないため、同一ウィジェットセッション(session_id)の
  // アクセスログから流入元を引き当てる。
  const referrerBySessionId = new Map(accessLogRows.map((log) => [log.session_id, log.referrer]));
  const orderRowsWithReferrer = orderRows.map((o) => ({
    ...o,
    referrerLabel: normalizeReferrer(o.session_id ? (referrerBySessionId.get(o.session_id) ?? null) : null),
  }));

  const scenarioDrilldown = buildDrilldownByKey(
    orderRowsWithReferrer,
    (o) => o.scenario_id ?? "",
    customerNamesById,
    productNames,
  );
  const productDrilldown = buildDrilldownByKey(orderRowsWithReferrer, (o) => o.product_id, customerNamesById, productNames);
  const referrerDrilldown = buildDrilldownByKey(
    orderRowsWithReferrer,
    (o) => o.referrerLabel,
    customerNamesById,
    productNames,
  );

  const summary = totalStats(accessLogRows, orderRows);
  const byAd = aggregateByAd(accessLogRows, orderRows);
  const byScenario = aggregateByScenarioSplit(accessLogRows, orderRows, scenarioNames);
  const byProduct = aggregateByProductSplit(orderRows, productNames);
  const byDate = aggregateByDateSplit(accessLogRows, orderRows);
  const byReferrer = aggregateByReferrerSplit(accessLogRows, orderRowsWithReferrer);

  const scenarioPivot = buildPivotTable(
    orderRows,
    (o) => o.scenario_id ?? "",
    (o) => (o.scenario_id ? (scenarioNames[o.scenario_id] ?? "(削除済みシナリオ)") : "(シナリオ不明)"),
    dateFrom,
    dateTo,
  );
  const productPivot = buildPivotTable(
    orderRows,
    (o) => o.product_id,
    (o) => productNames[o.product_id] ?? "(削除済み商品)",
    dateFrom,
    dateTo,
  );

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">実績ダッシュボード</h1>
        <PrintButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        チャットボットへのアクセス数・購入数・売上を、シナリオ・商品・日付・広告(UTMパラメータ)・流入元(設置LP)・ブランド別に確認できます。
        アクセス数はウィジェットが開かれた時点でこのアプリが記録したものです。購入数・売上は入金/受注が確定した注文(与信待ち・失敗・キャンセルを除く)のみを集計しています。
        「新規」は単品購入・定期初回、「継続」は定期の2回目以降を指します。増分利益は広告費を除く(売上-原価-同梱物費用-送料原価-販売手数料-支払手数料、コスト設定導入前の注文は0円扱い)。
        シナリオ別・商品別・流入元別の「合計」表は、行の▸をクリックすると顧客単位の注文明細(生データ)が見られます。
      </p>

      {(accessError || ordersError) && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          データの取得に失敗しました({accessError?.message ?? ordersError?.message})
        </p>
      )}

      <StickyBelowHeader className="print:hidden mb-6 rounded-lg border border-neutral-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <CollapsibleFilterBar>
          <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">日付(から)</span>
              <input type="date" name="dateFrom" defaultValue={dateFrom} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">日付(まで)</span>
              <input type="date" name="dateTo" defaultValue={dateTo} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">ブランド</span>
              <select name="brandId" defaultValue={brandId} className="input">
                <option value="">すべて</option>
                {(brands ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {!b.code && "(コード未設定)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">シナリオ</span>
              <select name="scenarioId" defaultValue={scenarioId} className="input">
                <option value="">すべて</option>
                {(scenarios ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              絞り込む
            </button>
          </form>
        </CollapsibleFilterBar>
      </StickyBelowHeader>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="アクセス数" value={summary.accessCount.toLocaleString()} />
        <SummaryCard label="購入数" value={summary.purchaseCount.toLocaleString()} />
        <SummaryCard label="売上(税込)" value={formatYen(summary.revenue)} />
        <SummaryCard label="コンバージョン率" value={formatRate(summary.conversionRate)} />
        <SummaryCard label="増分利益" value={formatYen(summary.incrementalProfit)} />
      </div>

      <TabbedPanels
        tabs={[
          {
            key: "ad",
            label: "広告別内訳",
            shortLabel: "広告別",
            content: (
              <Section
                title="広告別内訳"
                exportButton={
                  <CsvExportButton filename="広告別内訳.csv" headers={STATS_CSV_HEADERS} rows={byAd.map(statsCsvRow)} />
                }
              >
                <StatsTable rows={byAd} labelHeader="広告(utm_source / utm_medium / utm_campaign)" />
              </Section>
            ),
          },
          {
            key: "referrer",
            label: "流入元別(設置LP別)",
            shortLabel: "流入元別",
            content: (
              <Section
                title="流入元別(設置LP別)"
                exportButton={
                  <CsvExportButton
                    filename="流入元別内訳.csv"
                    headers={SPLIT_STATS_CSV_HEADERS}
                    rows={byReferrer.map(splitStatsCsvRow)}
                  />
                }
              >
                <p className="mb-2 text-xs text-neutral-400">
                  チャットウィジェットが開かれた直前のページ(referrer)をホスト名+パス単位で集計しています。LP側のReferrer-Policy設定によっては取得できない場合があります。
                </p>
                <SplitStatsViewToggle
                  totalView={<TotalSplitStatsTable rows={byReferrer} labelHeader="流入元(LP)" drilldownByKey={referrerDrilldown} />}
                  detailView={<DetailSplitStatsTable rows={byReferrer} labelHeader="流入元(LP)" />}
                />
              </Section>
            ),
          },
          {
            key: "scenario",
            label: "シナリオ別",
            content: (
              <Section
                title="シナリオ別"
                exportButton={
                  <CsvExportButton
                    filename="シナリオ別内訳.csv"
                    headers={SPLIT_STATS_CSV_HEADERS}
                    rows={byScenario.map(splitStatsCsvRow)}
                  />
                }
              >
                <DashboardViewToggle
                  pivotLabel="シナリオ×日付"
                  listView={
                    <SplitStatsViewToggle
                      totalView={<TotalSplitStatsTable rows={byScenario} labelHeader="シナリオ" drilldownByKey={scenarioDrilldown} />}
                      detailView={<DetailSplitStatsTable rows={byScenario} labelHeader="シナリオ" />}
                    />
                  }
                  pivotView={<PivotTableView pivot={scenarioPivot} rowHeader="シナリオ" />}
                />
              </Section>
            ),
          },
          {
            key: "product",
            label: "商品別",
            content: (
              <Section
                title="商品別"
                exportButton={
                  <CsvExportButton
                    filename="商品別内訳.csv"
                    headers={SPLIT_STATS_CSV_HEADERS}
                    rows={byProduct.map(splitStatsCsvRow)}
                  />
                }
              >
                <DashboardViewToggle
                  pivotLabel="商品×日付"
                  listView={
                    <SplitStatsViewToggle
                      totalView={
                        <TotalSplitStatsTable rows={byProduct} labelHeader="商品" hideAccess drilldownByKey={productDrilldown} />
                      }
                      detailView={<DetailSplitStatsTable rows={byProduct} labelHeader="商品" />}
                    />
                  }
                  pivotView={<PivotTableView pivot={productPivot} rowHeader="商品" />}
                />
              </Section>
            ),
          },
          {
            key: "date",
            label: "日別推移",
            content: (
              <Section
                title="日別推移"
                exportButton={
                  <CsvExportButton filename="日別推移.csv" headers={SPLIT_STATS_CSV_HEADERS} rows={byDate.map(splitStatsCsvRow)} />
                }
              >
                <SplitStatsViewToggle
                  totalView={<TotalSplitStatsTable rows={byDate} labelHeader="日付" />}
                  detailView={<DetailSplitStatsTable rows={byDate} labelHeader="日付" />}
                />
              </Section>
            ),
          },
        ]}
      />
    </div>
  );
}

const STATS_CSV_HEADERS = ["項目", "アクセス数", "購入数", "売上(税込)", "CVR", "増分利益"];

function statsCsvRow(row: { label: string; stats: StatsWithConversion }): (string | number)[] {
  return [
    row.label,
    row.stats.accessCount,
    row.stats.purchaseCount,
    row.stats.revenue,
    row.stats.conversionRate === null ? "" : `${(row.stats.conversionRate * 100).toFixed(1)}%`,
    row.stats.incrementalProfit,
  ];
}

const SPLIT_STATS_CSV_HEADERS = [
  "項目",
  "アクセス数",
  "新規購入数(合計)",
  "新規売上(合計・税込)",
  "新規購入数(定期)",
  "新規売上(定期・税込)",
  "新規購入数(単品)",
  "新規売上(単品・税込)",
  "CVR",
  "平均単価(税込)",
  "継続購入数",
  "継続売上(税込)",
  "売上合計(税込)",
  "増分利益",
];

function splitStatsCsvRow(row: { label: string; stats: SplitStatsWithDerived }): (string | number)[] {
  const s = row.stats;
  return [
    row.label,
    s.accessCount,
    s.newPurchaseCount,
    s.newRevenue,
    s.newSubscriptionCount,
    s.newSubscriptionRevenue,
    s.newOneTimeCount,
    s.newOneTimeRevenue,
    s.conversionRate === null ? "" : `${(s.conversionRate * 100).toFixed(1)}%`,
    s.avgUnitPrice === null ? "" : Math.round(s.avgUnitPrice),
    s.continuingPurchaseCount,
    s.continuingRevenue,
    s.totalRevenue,
    s.incrementalProfit,
  ];
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  exportButton,
  children,
}: {
  title: string;
  exportButton?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
        {exportButton}
      </div>
      {children}
    </div>
  );
}

function StatsTable({
  rows,
  labelHeader,
  hideAccess,
}: {
  rows: { key: string; label: string; stats: StatsWithConversion }[];
  labelHeader: string;
  hideAccess?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">データがありません</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-sky-100 text-left text-neutral-600">
          <tr>
            <th className="px-3 py-2">{labelHeader}</th>
            {!hideAccess && <th className="px-3 py-2 text-right">アクセス数</th>}
            <th className="px-3 py-2 text-right">購入数</th>
            <th className="px-3 py-2 text-right">売上(税込)</th>
            {!hideAccess && <th className="px-3 py-2 text-right">CVR</th>}
            <th className="px-3 py-2 text-right">増分利益</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-neutral-100">
              <td className="px-3 py-2">{row.label}</td>
              {!hideAccess && <td className="px-3 py-2 text-right">{row.stats.accessCount.toLocaleString()}</td>}
              <td className="px-3 py-2 text-right">{row.stats.purchaseCount.toLocaleString()}</td>
              <td className="px-3 py-2 text-right">{formatYen(row.stats.revenue)}</td>
              {!hideAccess && <td className="px-3 py-2 text-right">{formatRate(row.stats.conversionRate)}</td>}
              <td className="px-3 py-2 text-right">{formatYen(row.stats.incrementalProfit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TotalSplitStatsTable({
  rows,
  labelHeader,
  hideAccess,
  drilldownByKey,
}: {
  rows: { key: string; label: string; stats: SplitStatsWithDerived }[];
  labelHeader: string;
  hideAccess?: boolean;
  drilldownByKey?: Map<string, DrilldownOrderRow[]>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">データがありません</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-sky-100 text-left text-neutral-600">
          <tr>
            <th className="px-3 py-2">{labelHeader}</th>
            {!hideAccess && <th className="px-3 py-2 text-right">アクセス</th>}
            <th className="px-3 py-2 text-right">購入数</th>
            <th className="px-3 py-2 text-right">新規売上(税込)</th>
            {!hideAccess && <th className="px-3 py-2 text-right">CVR</th>}
            <th className="px-3 py-2 text-right">平均単価(税込)</th>
            <th className="px-3 py-2 text-right">継続購入数</th>
            <th className="px-3 py-2 text-right">継続売上(税込)</th>
            <th className="px-3 py-2 text-right">売上合計(税込)</th>
            <th className="px-3 py-2 text-right">増分利益</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const drilldownRows = drilldownByKey?.get(row.key);
            return (
              <tr key={row.key} className="border-t border-neutral-100 align-top">
                <td className="px-3 py-2">
                  {drilldownRows && drilldownRows.length > 0 ? (
                    <details>
                      <summary className="cursor-pointer">{row.label}</summary>
                      <DrilldownRowsTable rows={drilldownRows} segmentLabel={row.label} />
                    </details>
                  ) : (
                    row.label
                  )}
                </td>
                {!hideAccess && <td className="px-3 py-2 text-right">{row.stats.accessCount.toLocaleString()}</td>}
                <td className="px-3 py-2 text-right">{row.stats.newPurchaseCount.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{formatYen(row.stats.newRevenue)}</td>
                {!hideAccess && <td className="px-3 py-2 text-right">{formatRate(row.stats.conversionRate)}</td>}
                <td className="px-3 py-2 text-right">
                  {row.stats.avgUnitPrice === null ? "-" : formatYen(Math.round(row.stats.avgUnitPrice))}
                </td>
                <td className="px-3 py-2 text-right">{row.stats.continuingPurchaseCount.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{formatYen(row.stats.continuingRevenue)}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatYen(row.stats.totalRevenue)}</td>
                <td className="px-3 py-2 text-right">{formatYen(row.stats.incrementalProfit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 内訳表の行を展開したときに表示する、顧客単位の生データ(注文明細)テーブル。 */
function DrilldownRowsTable({ rows, segmentLabel }: { rows: DrilldownOrderRow[]; segmentLabel: string }) {
  return (
    <div className="mt-2 border-t border-neutral-100 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-600">注文明細(生データ、{rows.length}件)</p>
        <CsvExportButton
          filename={`内訳明細_${segmentLabel}.csv`}
          headers={["顧客", "商品", "金額(税込)", "日付", "区分"]}
          rows={rows.map((r) => [r.customerName, r.productLabel, Math.round(r.revenue), r.dateLabel, r.kindLabel])}
        />
      </div>
      <div className="overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-3 py-1.5 text-left">顧客</th>
              <th className="px-3 py-1.5 text-left">商品</th>
              <th className="px-3 py-1.5 text-right">金額(税込)</th>
              <th className="px-3 py-1.5 text-left">日付</th>
              <th className="px-3 py-1.5 text-left">区分</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5">{r.customerName}</td>
                <td className="px-3 py-1.5">{r.productLabel}</td>
                <td className="px-3 py-1.5 text-right">{formatYen(r.revenue)}</td>
                <td className="px-3 py-1.5">{r.dateLabel}</td>
                <td className="px-3 py-1.5">{r.kindLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 新規注文を定期/単品の2行に分けた明細表(合計行は出さない)。 */
function DetailSplitStatsTable({
  rows,
  labelHeader,
}: {
  rows: { key: string; label: string; stats: SplitStatsWithDerived }[];
  labelHeader: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-400">データがありません</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-sky-100 text-left text-neutral-600">
          <tr>
            <th className="px-3 py-2">{labelHeader}</th>
            <th className="px-3 py-2">区分</th>
            <th className="px-3 py-2 text-right">購入数</th>
            <th className="px-3 py-2 text-right">新規売上(税込)</th>
            <th className="px-3 py-2 text-right">平均単価(税込)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.key}>
              <DetailSplitStatsRow
                label={row.label}
                kind="定期"
                count={row.stats.newSubscriptionCount}
                revenue={row.stats.newSubscriptionRevenue}
              />
              <DetailSplitStatsRow
                label={row.label}
                kind="単品"
                count={row.stats.newOneTimeCount}
                revenue={row.stats.newOneTimeRevenue}
              />
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailSplitStatsRow({
  label,
  kind,
  count,
  revenue,
}: {
  label: string;
  kind: "定期" | "単品";
  count: number;
  revenue: number;
}) {
  return (
    <tr className={`border-t border-neutral-100 ${kind === "定期" ? "bg-blue-50/60" : "bg-amber-50/60"}`}>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2">{kind}</td>
      <td className="px-3 py-2 text-right">{count.toLocaleString()}</td>
      <td className="px-3 py-2 text-right">{formatYen(revenue)}</td>
      <td className="px-3 py-2 text-right">{count > 0 ? formatYen(Math.round(revenue / count)) : "-"}</td>
    </tr>
  );
}

function formatMonthDay(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

function PivotMatrix({
  rowHeader,
  title,
  dateColumns,
  rowLabels,
  data,
  format,
}: {
  rowHeader: string;
  title: string;
  dateColumns: string[];
  rowLabels: string[];
  data: Record<string, Record<string, number>>;
  format: (v: number) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-sky-100 text-left text-neutral-600">
          <tr>
            <th className="sticky left-0 bg-sky-100 px-3 py-2">
              {rowHeader}別→<br />
              <span className="text-xs font-normal">{title}</span>
            </th>
            {dateColumns.map((d) => (
              <th key={d} className="px-3 py-2 text-right whitespace-nowrap">
                {formatMonthDay(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((label) => (
            <tr key={label} className="border-t border-neutral-100">
              <td className="sticky left-0 bg-white px-3 py-2">{label}</td>
              {dateColumns.map((d) => {
                const value = data[label]?.[d];
                return (
                  <td key={d} className="px-3 py-2 text-right">
                    {value ? format(value) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PivotTableView({
  pivot,
  rowHeader,
}: {
  pivot: { rowLabels: string[]; dateColumns: string[]; countMatrix: Record<string, Record<string, number>>; revenueMatrix: Record<string, Record<string, number>> };
  rowHeader: string;
}) {
  if (pivot.rowLabels.length === 0) {
    return <p className="text-sm text-neutral-400">データがありません</p>;
  }

  return (
    <div className="space-y-4">
      <PivotMatrix
        rowHeader={rowHeader}
        title="件数"
        dateColumns={pivot.dateColumns}
        rowLabels={pivot.rowLabels}
        data={pivot.countMatrix}
        format={(v) => v.toLocaleString()}
      />
      <PivotMatrix
        rowHeader={rowHeader}
        title="売上"
        dateColumns={pivot.dateColumns}
        rowLabels={pivot.rowLabels}
        data={pivot.revenueMatrix}
        format={(v) => formatYen(v)}
      />
    </div>
  );
}
