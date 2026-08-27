import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardViewToggle } from "@/components/admin/DashboardViewToggle";
import {
  aggregateByAd,
  aggregateByDateSplit,
  aggregateByProductSplit,
  aggregateByScenarioSplit,
  buildPivotTable,
  totalStats,
  type AccessLogRow,
  type OrderRow,
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

/** シナリオコード(英字2文字+数字4桁)の先頭2文字とブランドコードを突き合わせてブランドを判定する。 */
function resolveScenarioBrandId(
  orderCode: string | null,
  brandCodeToId: Map<string, string>,
): string | null {
  if (!orderCode || orderCode.length < 2) return null;
  return brandCodeToId.get(orderCode.slice(0, 2).toUpperCase()) ?? null;
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

  const [{ data: scenarios }, { data: products }, { data: brands }] = await Promise.all([
    supabase.from("scenarios").select("id, name, order_code").order("display_order"),
    supabase.from("products").select("id, name"),
    supabase.from("brands").select("id, name, code").order("name"),
  ]);
  const scenarioNames = Object.fromEntries((scenarios ?? []).map((s) => [s.id, s.name]));
  const productNames = Object.fromEntries((products ?? []).map((p) => [p.id, p.name]));

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
    .select("scenario_id, utm_source, utm_medium, utm_campaign, created_at")
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
      "scenario_id, product_id, amount, addon_amount, discount_amount, first_time_discount_amount, shipping_fee, payment_fee, utm_source, utm_medium, utm_campaign, created_at, billing_cycle_number",
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
  const orderRows: OrderRow[] = orders ?? [];

  const summary = totalStats(accessLogRows, orderRows);
  const byAd = aggregateByAd(accessLogRows, orderRows);
  const byScenario = aggregateByScenarioSplit(accessLogRows, orderRows, scenarioNames);
  const byProduct = aggregateByProductSplit(orderRows, productNames);
  const byDate = aggregateByDateSplit(accessLogRows, orderRows);

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
      <h1 className="mb-1 text-2xl font-semibold">実績ダッシュボード</h1>
      <p className="mb-4 text-sm text-neutral-500">
        チャットボットへのアクセス数・購入数・売上を、シナリオ・商品・日付・広告(UTMパラメータ)・ブランド別に確認できます。
        アクセス数はウィジェットが開かれた時点でこのアプリが記録したものです。購入数・売上は入金/受注が確定した注文(与信待ち・失敗・キャンセルを除く)のみを集計しています。
        「新規」は単品購入・定期初回、「継続」は定期の2回目以降を指します。
      </p>

      {(accessError || ordersError) && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          データの取得に失敗しました({accessError?.message ?? ordersError?.message})
        </p>
      )}

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
      >
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

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="アクセス数" value={summary.accessCount.toLocaleString()} />
        <SummaryCard label="購入数" value={summary.purchaseCount.toLocaleString()} />
        <SummaryCard label="売上" value={formatYen(summary.revenue)} />
        <SummaryCard label="コンバージョン率" value={formatRate(summary.conversionRate)} />
      </div>

      <Section title="広告別内訳">
        <StatsTable rows={byAd} labelHeader="広告(utm_source / utm_medium / utm_campaign)" />
      </Section>

      <Section title="シナリオ別">
        <DashboardViewToggle
          pivotLabel="シナリオ×日付"
          listView={<SplitStatsTable rows={byScenario} labelHeader="シナリオ" />}
          pivotView={<PivotTableView pivot={scenarioPivot} rowHeader="シナリオ" />}
        />
      </Section>

      <Section title="商品別">
        <DashboardViewToggle
          pivotLabel="商品×日付"
          listView={<SplitStatsTable rows={byProduct} labelHeader="商品" hideAccess />}
          pivotView={<PivotTableView pivot={productPivot} rowHeader="商品" />}
        />
      </Section>

      <Section title="日別推移">
        <SplitStatsTable rows={byDate} labelHeader="日付" />
      </Section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">{title}</h2>
      {children}
    </div>
  );
}

function StatsTable({
  rows,
  labelHeader,
  hideAccess,
}: {
  rows: { key: string; label: string; stats: { accessCount: number; purchaseCount: number; revenue: number; conversionRate: number | null } }[];
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
            <th className="px-3 py-2 text-right">売上</th>
            {!hideAccess && <th className="px-3 py-2 text-right">CVR</th>}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitStatsTable({
  rows,
  labelHeader,
  hideAccess,
}: {
  rows: {
    key: string;
    label: string;
    stats: {
      accessCount: number;
      newPurchaseCount: number;
      newRevenue: number;
      conversionRate: number | null;
      avgUnitPrice: number | null;
      continuingPurchaseCount: number;
      continuingRevenue: number;
      totalRevenue: number;
    };
  }[];
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
            {!hideAccess && <th className="px-3 py-2 text-right">アクセス</th>}
            <th className="px-3 py-2 text-right">購入数</th>
            <th className="px-3 py-2 text-right">新規売上</th>
            {!hideAccess && <th className="px-3 py-2 text-right">CVR</th>}
            <th className="px-3 py-2 text-right">平均単価</th>
            <th className="px-3 py-2 text-right">継続購入数</th>
            <th className="px-3 py-2 text-right">継続売上</th>
            <th className="px-3 py-2 text-right">売上合計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-neutral-100">
              <td className="px-3 py-2">{row.label}</td>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
