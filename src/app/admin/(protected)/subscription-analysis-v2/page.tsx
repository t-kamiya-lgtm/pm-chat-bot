import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveScenarioBrandId } from "@/lib/brand-resolution";
import {
  buildCustomerProfiles,
  resolveSegmentLabel,
  resolveLabel,
  SEGMENT_AXES,
  type LtvOrderRow,
  type LtvCustomerRow,
  type BundleSetCriteria,
  type SegmentContext,
  type SegmentAxis,
} from "@/lib/subscription-ltv";
import {
  buildSegmentReliability,
  buildOverallReliability,
  buildRetentionCurve,
  geoMeanTransitionRate,
  projectLtv,
  survivalRateAtN,
  commonBaselineN,
  decomposeIncrementalProfitLtv,
  type SegmentReliabilityRow,
  type IncrementalProfitFactorDecomposition,
} from "@/lib/subscription-ltv-maturity";
import { PrintButton } from "@/components/admin/PrintButton";
import { CsvExportButton } from "@/components/admin/CsvExportButton";
import { buildLifetimeAndAnnualLtv, type LifetimeLtvOrderRow } from "@/lib/customer-lifetime-ltv";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import { StickyBelowHeader } from "@/components/admin/StickyBelowHeader";
import { TabbedPanels } from "@/components/admin/TabbedPanels";
import { CollapsibleFilterBar } from "@/components/admin/CollapsibleFilterBar";

export const dynamic = "force-dynamic";

const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];
const HORIZON = 12;

function formatYenFloor(amount: number): string {
  return `${Math.floor(amount).toLocaleString()}円`;
}

interface CustomerRowWithName extends LtvCustomerRow {
  name: string | null;
}

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

function formatSignedYen(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toLocaleString()}円`;
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatElapsed(days: number): string {
  if (days < 30) return `${Math.floor(days)}日`;
  return `約${(days / 30).toFixed(1)}ヶ月`;
}

type RowWithDerived = {
  row: SegmentReliabilityRow;
  curve: ReturnType<typeof buildRetentionCurve>;
  projected: ReturnType<typeof projectLtv>;
  commonRate: number;
};

type RowWithSurvivalSum = RowWithDerived & { survivalSum: number };

/**
 * セグメント一覧から、①要因分解の基準行(契約者数が最多のセグメント)と、
 * ②他セグメントとの予測増分利益LTVの要因分解を組み立てる。
 * ①②(セグメント別レポート・要因分解タブ)の両方から参照する共通の前処理。
 */
function buildSegmentAnalysisData(rowsWithDerived: RowWithDerived[]): {
  withSurvivalSum: RowWithSurvivalSum[];
  baselineEntry: RowWithSurvivalSum | null;
  decompositionRows: { segment: string; decomposition: IncrementalProfitFactorDecomposition }[];
} {
  const withSurvivalSum = rowsWithDerived.map((entry) => ({
    ...entry,
    survivalSum: entry.curve.reduce((sum, p) => sum + p.forecast / 100, 0),
  }));
  const baselineEntry =
    withSurvivalSum.length > 0
      ? withSurvivalSum.reduce((best, cur) => (cur.row.customerCount > best.row.customerCount ? cur : best))
      : null;
  const decompositionRows = baselineEntry
    ? withSurvivalSum
        .filter((entry) => entry.row.segment !== baselineEntry.row.segment)
        .map((entry) => ({
          segment: entry.row.segment,
          decomposition: decomposeIncrementalProfitLtv(
            {
              avgUnitPrice: baselineEntry.row.avgUnitPrice,
              avgIncrementalProfitPerOrder: baselineEntry.row.avgIncrementalProfitPerOrder,
              survivalSum: baselineEntry.survivalSum,
            },
            {
              avgUnitPrice: entry.row.avgUnitPrice,
              avgIncrementalProfitPerOrder: entry.row.avgIncrementalProfitPerOrder,
              survivalSum: entry.survivalSum,
            },
          ),
        }))
    : [];
  return { withSurvivalSum, baselineEntry, decompositionRows };
}

export default async function AdminSubscriptionAnalysisV2Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const getParam = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const dateFrom = getParam("dateFrom") || "";
  const dateTo = getParam("dateTo") || "";
  const brandId = getParam("brandId") || "";
  const validAxisKeys = new Set(SEGMENT_AXES.map((a) => a.key));
  const axisParam = sp["axis"];
  const selectedAxesRaw = (Array.isArray(axisParam) ? axisParam : axisParam ? [axisParam] : []).filter(
    (v): v is SegmentAxis => validAxisKeys.has(v as SegmentAxis),
  );
  const selectedAxes: SegmentAxis[] = selectedAxesRaw.length > 0 ? selectedAxesRaw : ["scenario"];

  const supabase = createSupabaseAdminClient();

  const [
    { data: customers },
    { data: orders },
    { data: scenarios },
    { data: brands },
    { data: products },
    { data: accessLogs },
    { data: subscriptions },
    { data: bundleSetsRaw },
    { data: retentionActions },
  ] = await Promise.all([
    supabase.from("customers").select("id, name, gender, birth_date"),
    supabase
      .from("orders")
      .select(
        "id, customer_id, scenario_id, product_id, type, payment_method, billing_cycle_number, quantity, amount, addon_amount, discount_amount, first_time_discount_amount, shipping_fee, payment_fee, created_at, session_id, cost_amount, bundle_insert_cost, shipping_cost, sales_commission_amount",
      )
      .in("status", CONFIRMED_ORDER_STATUSES),
    supabase.from("scenarios").select("id, name, order_code"),
    supabase.from("brands").select("id, name, code").order("name", { ascending: true }),
    supabase.from("products").select("id, name"),
    supabase.from("scenario_access_logs").select("session_id, referrer"),
    supabase.from("subscriptions").select("order_id, interval, status"),
    supabase
      .from("bundle_insert_sets")
      .select("id, name, brand_id, period_start, period_end, target_order_type, target_cycle_numbers, target_product_ids"),
    supabase.from("customer_retention_actions").select("customer_id"),
  ]);

  const customersById = new Map((customers ?? []).map((c) => [c.id as string, c as CustomerRowWithName]));
  const scenarioNames = new Map((scenarios ?? []).map((s) => [s.id as string, s.name as string]));
  const scenarioOrderCodes = new Map((scenarios ?? []).map((s) => [s.id as string, s.order_code as string | null]));
  const brandCodeToId = new Map(
    (brands ?? []).filter((b) => b.code).map((b) => [(b.code as string).toUpperCase(), b.id as string]),
  );
  const brandNames = new Map((brands ?? []).map((b) => [b.id as string, b.name as string]));
  const productNames = new Map((products ?? []).map((p) => [p.id as string, p.name as string]));
  const referrerBySessionId = new Map(
    (accessLogs ?? []).map((l) => [l.session_id as string, l.referrer as string | null]),
  );
  const intervalByOrderId = new Map((subscriptions ?? []).map((s) => [s.order_id as string, s.interval as string]));
  const statusByOrderId = new Map((subscriptions ?? []).map((s) => [s.order_id as string, s.status as string]));
  const bundleSets: BundleSetCriteria[] = (bundleSetsRaw ?? []) as unknown as BundleSetCriteria[];
  const customerIdsWithRetentionAction = new Set((retentionActions ?? []).map((r) => r.customer_id as string));

  const ctx: SegmentContext = {
    scenarioNames,
    scenarioOrderCodes,
    brandCodeToId,
    brandNames,
    productNames,
    referrerBySessionId,
    intervalByOrderId,
    bundleSets,
    customerIdsWithRetentionAction,
  };

  let orderRows: LtvOrderRow[] = (orders ?? []) as unknown as LtvOrderRow[];

  if (brandId) {
    const scenarioIdsForBrand = new Set(
      (scenarios ?? [])
        .filter((s) => resolveScenarioBrandId(s.order_code as string | null, brandCodeToId) === brandId)
        .map((s) => s.id as string),
    );
    orderRows = orderRows.filter((o) => o.scenario_id && scenarioIdsForBrand.has(o.scenario_id));
  }

  let profiles = buildCustomerProfiles(orderRows);

  if (dateFrom) {
    const fromTime = new Date(`${dateFrom}T00:00:00+09:00`).getTime();
    profiles = profiles.filter((p) => new Date(p.firstOrder.created_at).getTime() >= fromTime);
  }
  if (dateTo) {
    const toTime = new Date(`${dateTo}T23:59:59+09:00`).getTime();
    profiles = profiles.filter((p) => new Date(p.firstOrder.created_at).getTime() <= toTime);
  }

  const asOfIso = new Date().toISOString();
  const reliabilityRows = buildSegmentReliability(profiles, customersById, selectedAxes, ctx, asOfIso);
  const overallRow = buildOverallReliability(profiles, customersById, ctx, asOfIso);
  const fallbackRate = overallRow ? (geoMeanTransitionRate(overallRow) ?? undefined) : undefined;
  const commonN = commonBaselineN(reliabilityRows);

  const rowsWithDerived: RowWithDerived[] = reliabilityRows.map((row) => {
    const curve = buildRetentionCurve(row, { horizon: HORIZON, fallbackRate });
    const projected = projectLtv(row, curve);
    return {
      row,
      curve,
      projected,
      commonRate: survivalRateAtN(row, commonN),
    };
  });

  const totalSubscribers = profiles.filter((p) => p.isSubscriber).length;

  const { withSurvivalSum, baselineEntry, decompositionRows } = buildSegmentAnalysisData(rowsWithDerived);

  const segmentHeaderLabel = selectedAxes.map((key) => SEGMENT_AXES.find((a) => a.key === key)?.label ?? key).join(" × ");
  const csvKey = selectedAxes.join("+");

  // 生涯LTV・年間LTVは「これまでの蓄積実績の全体像」を示すための指標なので、
  // 下部の獲得日フィルタの影響を受けず常に全期間で計算する
  // (orderRowsはprofilesと違い獲得日フィルタ適用前のため、ブランド絞り込みのみが効く)。
  const lifetimeAndAnnualLtv = buildLifetimeAndAnnualLtv(
    orderRows as unknown as LifetimeLtvOrderRow[],
    asOfIso,
    intervalByOrderId,
    SUBSCRIPTION_INTERVAL_DAYS,
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">定期分析(新)</h1>
        <PrintButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        施策(セグメント)ごとに開始時期が違うと、暦日の期間だけで比較するのはミスリードになります。各セグメントには「経過期間から確定できる固有到達回数」と、比較対象内で最も浅いセグメントに揃えた「共通比較回数」の両方を表示し、確定値と予測値(自動更新モデル)を区別します。
      </p>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">蓄積実績LTV(確定値・全期間{brandId ? "・このブランドのみ" : "・全ブランド"})</h2>
          <p className="text-xs text-neutral-400">
            下部の獲得日絞り込みの影響を受けません。年間LTVは、お届け頻度別の到達回数(1ヶ月ごと=12回・2ヶ月ごと=6回・2週間ごと=24回、単品のみの顧客は365日)に到達した時点の実績で固定し、それ以降の実績では更新しません。頻度を途中で変更した顧客は、獲得時点の頻度(実測できる場合は初回→2回目の実際の間隔から判定)を基準にします。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <LtvSummaryCard label="生涯LTV(売上)" value={formatYenFloor(lifetimeAndAnnualLtv.lifetimeRevenueLtv)} sub={`対象 ${lifetimeAndAnnualLtv.lifetimeCustomerCount.toLocaleString()}人`} />
          <LtvSummaryCard label="生涯LTV(増分利益)" value={formatYenFloor(lifetimeAndAnnualLtv.lifetimeIncrementalProfitLtv)} sub={`対象 ${lifetimeAndAnnualLtv.lifetimeCustomerCount.toLocaleString()}人`} />
          <LtvSummaryCard label="年間LTV(売上)" value={formatYenFloor(lifetimeAndAnnualLtv.annualRevenueLtv)} sub={`対象 ${lifetimeAndAnnualLtv.annualCustomerCount.toLocaleString()}人`} />
          <LtvSummaryCard label="年間LTV(増分利益)" value={formatYenFloor(lifetimeAndAnnualLtv.annualIncrementalProfitLtv)} sub={`対象 ${lifetimeAndAnnualLtv.annualCustomerCount.toLocaleString()}人`} />
        </div>
      </div>

      <StickyBelowHeader className="print:hidden mb-6 rounded-lg border border-neutral-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <CollapsibleFilterBar>
          <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">獲得日(から、初回注文日基準)</span>
              <input type="date" name="dateFrom" defaultValue={dateFrom} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">獲得日(まで)</span>
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
            <div className="block">
              <span className="mb-1 block text-xs text-neutral-500">セグメント軸(複数選択で組み合わせ集計)</span>
              <div className="flex flex-wrap gap-1.5">
                {SEGMENT_AXES.map((a) => (
                  <label
                    key={a.key}
                    className="flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
                  >
                    <input type="checkbox" name="axis" value={a.key} defaultChecked={selectedAxes.includes(a.key)} />
                    {a.label}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              絞り込む
            </button>
          </form>
        </CollapsibleFilterBar>
        <p className="mt-2 text-xs text-neutral-500">
          現在の軸: <strong>{segmentHeaderLabel}</strong> / 対象定期契約者数: <strong>{totalSubscribers.toLocaleString()}</strong>人
        </p>
      </StickyBelowHeader>

      <TabbedPanels
        tabs={[
          {
            key: "segment",
            label: "①セグメント別レポート",
            shortLabel: "①セグメント別",
            content: (
              <SegmentTablePanel
                rowsWithDerived={withSurvivalSum}
                commonN={commonN}
                axis={selectedAxes}
                profiles={profiles}
                customersById={customersById}
                ctx={ctx}
                statusByOrderId={statusByOrderId}
                csvKey={csvKey}
                sectionTitle={`${segmentHeaderLabel}別`}
              />
            ),
          },
          {
            key: "cohort",
            label: "②残存率コホート表(実績+予測)",
            shortLabel: "②コホート表",
            content: <CohortPanel rowsWithDerived={rowsWithDerived} csvKey={csvKey} />,
          },
          {
            key: "factor",
            label: `③予測増分利益LTVの要因分解${baselineEntry ? `(基準: ${baselineEntry.row.segment})` : ""}`,
            shortLabel: "③要因分解",
            content: (
              <FactorDecompositionPanel baselineEntry={baselineEntry} decompositionRows={decompositionRows} csvKey={csvKey} />
            ),
          },
        ]}
      />
    </div>
  );
}

function SegmentTablePanel({
  rowsWithDerived,
  commonN,
  axis,
  profiles,
  customersById,
  ctx,
  statusByOrderId,
  csvKey,
  sectionTitle,
}: {
  rowsWithDerived: RowWithSurvivalSum[];
  commonN: number;
  axis: SegmentAxis | SegmentAxis[];
  profiles: ReturnType<typeof buildCustomerProfiles>;
  customersById: Map<string, CustomerRowWithName>;
  ctx: SegmentContext;
  statusByOrderId: Map<string, string>;
  csvKey: string;
  sectionTitle: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">{sectionTitle}</h2>
      <p className="mb-4 text-sm text-neutral-600">
        共通比較回数(このセグメント一覧内で最も浅いセグメントに揃えた基準): <strong>{commonN}回目</strong>
      </p>

      <div className="mb-2 flex items-center justify-end">
        <CsvExportButton
          filename={`定期分析新_${csvKey}.csv`}
          headers={[
            "セグメント",
            "契約者数",
            "経過期間",
            "固有到達回数",
            "固有移行率",
            `共通比較回数(${commonN}回目)`,
            "客単価(税込)",
            `予測売上LTV(${HORIZON}回目まで)`,
            `予測増分利益LTV(${HORIZON}回目まで)`,
          ]}
          rows={rowsWithDerived.map(({ row, projected, commonRate }) => [
            row.segment,
            row.customerCount,
            formatElapsed(row.elapsedDays),
            row.ownN,
            `${(survivalRateAtN(row, row.ownN) * 100).toFixed(1)}%`,
            `${(commonRate * 100).toFixed(1)}%`,
            Math.round(row.avgUnitPrice),
            Math.round(projected.revenueLtv),
            Math.round(projected.incrementalProfitLtv),
          ])}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-sky-100 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-2">セグメント</th>
              <th className="px-4 py-2">契約者数</th>
              <th className="px-4 py-2">経過期間</th>
              <th className="px-4 py-2">固有到達回数</th>
              <th className="px-4 py-2">固有移行率</th>
              <th className="px-4 py-2">共通比較回数({commonN}回目)</th>
              <th className="px-4 py-2">客単価(税込)</th>
              <th className="px-4 py-2">予測売上LTV({HORIZON}回目まで)</th>
              <th className="px-4 py-2">予測増分利益LTV({HORIZON}回目まで)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rowsWithDerived.map(({ row, projected, commonRate, survivalSum }) => (
              <tr key={row.segment} className="align-top hover:bg-neutral-50">
                <td className="px-4 py-2 font-medium">
                  <details>
                    <summary className="cursor-pointer">{row.segment}</summary>
                    <SegmentDetail
                      row={row}
                      axis={axis}
                      profiles={profiles}
                      customersById={customersById}
                      ctx={ctx}
                      statusByOrderId={statusByOrderId}
                      survivalSum={survivalSum}
                    />
                  </details>
                </td>
                <td className="px-4 py-2">{row.customerCount.toLocaleString()}人</td>
                <td className="px-4 py-2 text-neutral-500">{formatElapsed(row.elapsedDays)}</td>
                <td className="px-4 py-2">
                  {row.ownN}回目<span className="ml-1 text-xs text-neutral-400">({formatPercent(survivalRateAtN(row, row.ownN) * 100)})</span>
                </td>
                <td className="px-4 py-2 font-semibold">{formatPercent(survivalRateAtN(row, row.ownN) * 100)}</td>
                <td className="px-4 py-2 font-semibold bg-blue-50/50">{formatPercent(commonRate * 100)}</td>
                <td className="px-4 py-2">{formatYen(row.avgUnitPrice)}</td>
                <td className="px-4 py-2">{formatYen(projected.revenueLtv)}</td>
                <td className="px-4 py-2">{formatYen(projected.incrementalProfitLtv)}</td>
              </tr>
            ))}
            {rowsWithDerived.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  対象の定期契約者がいません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 mb-8 space-y-0.5 text-xs text-neutral-400">
        <li>固有到達回数: セグメントの契約者全員が、各自のお届け頻度で到達しうる時期に来ている最大回数(頻度が混在していても正しく判定します)</li>
        <li>共通比較回数: 表示中のセグメントのうち最も浅い固有到達回数に揃えた基準。この列だけが公平な比較に使える確定値</li>
        <li>予測LTV: 確定済みの残存率カーブを{HORIZON}回目まで自動延長(確定済み全回次間の移行率の幾何平均、無ければ全体平均で代用)して算出</li>
        <li>セグメント行の▸をクリックすると、そのセグメントに含まれる顧客明細(生データ)が見られます</li>
      </ul>
    </div>
  );
}

function CohortPanel({ rowsWithDerived, csvKey }: { rowsWithDerived: RowWithDerived[]; csvKey: string }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">残存率コホート表(実績+予測)</h2>
        <CsvExportButton
          filename={`残存率コホート表_${csvKey}.csv`}
          headers={["セグメント", ...Array.from({ length: HORIZON }, (_, i) => `${i + 1}回目`)]}
          rows={rowsWithDerived.map(({ row, curve }) => [row.segment, ...curve.map((p) => `${p.forecast.toFixed(1)}%`)])}
        />
      </div>
      <p className="mb-2 text-xs text-neutral-400">
        行=セグメント、列=到達回数ごとの残存率。白背景は確定値(実測)、グレー背景は予測値(自動更新モデル)です。
      </p>
      <RetentionCohortTable rowsWithDerived={rowsWithDerived} horizon={HORIZON} />
    </div>
  );
}

function FactorDecompositionPanel({
  baselineEntry,
  decompositionRows,
  csvKey,
}: {
  baselineEntry: RowWithSurvivalSum | null;
  decompositionRows: { segment: string; decomposition: IncrementalProfitFactorDecomposition }[];
  csvKey: string;
}) {
  if (!baselineEntry || decompositionRows.length === 0) {
    return <p className="text-sm text-neutral-400">比較できるセグメントが2件以上ありません。</p>;
  }
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">
          予測増分利益LTVの要因分解(基準: {baselineEntry.row.segment})
        </h2>
        <CsvExportButton
          filename={`要因分解_${csvKey}.csv`}
          headers={["セグメント", "客単価要因", "コスト要因", "残存率要因", "差分合計"]}
          rows={decompositionRows.map(({ segment, decomposition }) => [
            segment,
            Math.round(decomposition.priceFactor),
            Math.round(decomposition.costFactor),
            Math.round(decomposition.survivalFactor),
            Math.round(decomposition.total),
          ])}
        />
      </div>
      <p className="mb-2 text-xs text-neutral-400">
        契約者数が最も多いセグメント「{baselineEntry.row.segment}」を基準に、他セグメントとの予測増分利益LTVの差を「客単価要因」「コスト要因(原価・同梱物費用・送料原価・手数料の合算)」「残存率要因」に分解します。3つの要因の合計は必ず実際の差分と一致します(客単価→コスト→残存率の順で寄与を割り当てる方式のため、順序を変えると内訳の配分は変わりますが合計は変わりません)。
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-sky-100 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-2">セグメント</th>
              <th className="px-4 py-2 text-right">客単価要因</th>
              <th className="px-4 py-2 text-right">コスト要因</th>
              <th className="px-4 py-2 text-right">残存率要因</th>
              <th className="px-4 py-2 text-right">差分合計</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {decompositionRows.map(({ segment, decomposition }) => (
              <tr key={segment}>
                <td className="px-4 py-2 font-medium">{segment}</td>
                <td className="px-4 py-2 text-right">{formatSignedYen(decomposition.priceFactor)}</td>
                <td className="px-4 py-2 text-right">{formatSignedYen(decomposition.costFactor)}</td>
                <td className="px-4 py-2 text-right">{formatSignedYen(decomposition.survivalFactor)}</td>
                <td className="px-4 py-2 text-right font-semibold">{formatSignedYen(decomposition.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 行=セグメント、列=到達回数の残存率マトリクス。確定値/予測値をセルの背景で区別する。 */
function RetentionCohortTable({
  rowsWithDerived,
  horizon,
}: {
  rowsWithDerived: { row: SegmentReliabilityRow; curve: ReturnType<typeof buildRetentionCurve> }[];
  horizon: number;
}) {
  if (rowsWithDerived.length === 0) {
    return <p className="text-sm text-neutral-400">対象の定期契約者がいません</p>;
  }
  const cycles = Array.from({ length: horizon }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-sky-100 text-xs text-neutral-600">
          <tr>
            <th className="px-4 py-2">セグメント</th>
            {cycles.map((n) => (
              <th key={n} className="px-3 py-2 text-right">
                {n}回目
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rowsWithDerived.map(({ row, curve }) => (
            <tr key={row.segment}>
              <td className="px-4 py-2 font-medium">{row.segment}</td>
              {curve.map((p) => (
                <td
                  key={p.n}
                  className={`px-3 py-2 text-right ${p.confirmed === null ? "bg-neutral-50 text-neutral-400" : "text-neutral-900"}`}
                >
                  {formatPercent(p.forecast)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LtvSummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

function SegmentDetail({
  row,
  axis,
  profiles,
  customersById,
  ctx,
  statusByOrderId,
  survivalSum,
}: {
  row: SegmentReliabilityRow;
  axis: SegmentAxis | SegmentAxis[];
  profiles: ReturnType<typeof buildCustomerProfiles>;
  customersById: Map<string, CustomerRowWithName>;
  ctx: SegmentContext;
  statusByOrderId: Map<string, string>;
  survivalSum: number;
}) {
  const segmentCustomers = profiles.filter((p) => {
    if (!p.isSubscriber || !p.firstSubOrder) return false;
    const customer = customersById.get(p.customerId);
    if (!customer) return false;
    return resolveLabel(axis, p.firstSubOrder, customer, ctx) === row.segment;
  });

  const drilldownRows = segmentCustomers.map((p) => {
    const customer = customersById.get(p.customerId)!;
    const firstSubOrder = p.firstSubOrder!;
    const scenarioLabel = resolveSegmentLabel("scenario", firstSubOrder, customer, ctx);
    const bundleLabel = resolveSegmentLabel("bundleSet", firstSubOrder, customer, ctx);
    const avgUnitPrice = p.subscriptionCycleCount > 0 ? p.subscriptionRevenue / p.subscriptionCycleCount : 0;
    const avgProfitPerOrder = p.subscriptionCycleCount > 0 ? p.totalIncrementalProfit / p.subscriptionCycleCount : 0;
    const statusRaw = statusByOrderId.get(firstSubOrder.id);
    const statusLabel = statusRaw === "canceled" ? "解約済み(確定)" : statusRaw === "active" ? "継続中" : "不明";
    return {
      customerId: p.customerId,
      customerName: customer.name || "(名称未設定)",
      scenarioLabel,
      bundleLabel,
      avgUnitPrice,
      projectedRevenueLtv: avgUnitPrice * survivalSum,
      projectedIncrementalProfitLtv: avgProfitPerOrder * survivalSum,
      cycleCount: p.subscriptionCycleCount,
      statusLabel,
    };
  });

  return (
    <div className="mt-3 space-y-4 border-t border-neutral-100 pt-3">

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-neutral-600">顧客明細(生データ)</p>
          <CsvExportButton
            filename={`定期分析新_顧客明細_${row.segment}.csv`}
            headers={["顧客", "シナリオ", "同梱物", "客単価", `見込み売上LTV(${HORIZON}回目まで)`, `見込み増分利益LTV(${HORIZON}回目まで)`, "到達回数", "状態"]}
            rows={drilldownRows.map((d) => [
              d.customerName,
              d.scenarioLabel,
              d.bundleLabel,
              Math.round(d.avgUnitPrice),
              Math.round(d.projectedRevenueLtv),
              Math.round(d.projectedIncrementalProfitLtv),
              d.cycleCount,
              d.statusLabel,
            ])}
          />
        </div>
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-3 py-1.5 text-left">顧客</th>
                <th className="px-3 py-1.5 text-left">シナリオ</th>
                <th className="px-3 py-1.5 text-left">同梱物</th>
                <th className="px-3 py-1.5 text-right">客単価</th>
                <th className="px-3 py-1.5 text-right">見込み売上LTV</th>
                <th className="px-3 py-1.5 text-right">見込み増分利益LTV</th>
                <th className="px-3 py-1.5 text-right">到達回数</th>
                <th className="px-3 py-1.5 text-left">状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {drilldownRows.map((d) => (
                <tr key={d.customerId}>
                  <td className="px-3 py-1.5">{d.customerName}</td>
                  <td className="px-3 py-1.5">{d.scenarioLabel}</td>
                  <td className="px-3 py-1.5">{d.bundleLabel}</td>
                  <td className="px-3 py-1.5 text-right">{formatYen(d.avgUnitPrice)}</td>
                  <td className="px-3 py-1.5 text-right">{formatYen(d.projectedRevenueLtv)}</td>
                  <td className="px-3 py-1.5 text-right">{formatYen(d.projectedIncrementalProfitLtv)}</td>
                  <td className="px-3 py-1.5 text-right">{d.cycleCount}回</td>
                  <td className="px-3 py-1.5">{d.statusLabel}</td>
                </tr>
              ))}
              {drilldownRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-center text-neutral-400">
                    対象の顧客がいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
