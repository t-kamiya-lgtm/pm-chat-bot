import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveScenarioBrandId } from "@/lib/brand-resolution";
import {
  buildCustomerProfiles,
  resolveSegmentLabel,
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
  type SegmentReliabilityRow,
} from "@/lib/subscription-ltv-maturity";
import { PrintButton } from "@/components/admin/PrintButton";
import { CsvExportButton } from "@/components/admin/CsvExportButton";

export const dynamic = "force-dynamic";

const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];
const HORIZON = 12;

interface CustomerRowWithName extends LtvCustomerRow {
  name: string | null;
}

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatElapsed(days: number): string {
  if (days < 30) return `${Math.floor(days)}日`;
  return `約${(days / 30).toFixed(1)}ヶ月`;
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
  const axisParam = getParam("axis") || "scenario";
  const axis: SegmentAxis = (SEGMENT_AXES.find((a) => a.key === axisParam)?.key ?? "scenario") as SegmentAxis;

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
  const reliabilityRows = buildSegmentReliability(profiles, customersById, axis, ctx, asOfIso);
  const overallRow = buildOverallReliability(profiles, customersById, ctx, asOfIso);
  const fallbackRate = overallRow ? (geoMeanTransitionRate(overallRow) ?? undefined) : undefined;
  const commonN = commonBaselineN(reliabilityRows);

  const rowsWithDerived = reliabilityRows.map((row) => {
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

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">定期分析(新)</h1>
        <PrintButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        施策(セグメント)ごとに開始時期が違うと、暦日の期間だけで比較するのはミスリードになります。各セグメントには「経過期間から確定できる固有到達回数」と、比較対象内で最も浅いセグメントに揃えた「共通比較回数」の両方を表示し、確定値と予測値(自動更新モデル)を区別します。既存の「定期分析」は比較用にそのまま残しています。
      </p>

      <form
        method="get"
        className="print:hidden mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
      >
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
        <input type="hidden" name="axis" value={axis} />
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          絞り込む
        </button>
      </form>

      <div className="print:hidden mb-4">
        <span className="mb-1 block text-xs text-neutral-500">セグメント軸</span>
        <div className="flex flex-wrap gap-1">
          {SEGMENT_AXES.map((a) => {
            const params = new URLSearchParams();
            if (dateFrom) params.set("dateFrom", dateFrom);
            if (dateTo) params.set("dateTo", dateTo);
            if (brandId) params.set("brandId", brandId);
            params.set("axis", a.key);
            const active = a.key === axis;
            return (
              <Link
                key={a.key}
                href={`?${params.toString()}`}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-neutral-300 text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {a.label}
              </Link>
            );
          })}
        </div>
      </div>

      <p className="mb-4 text-sm text-neutral-600">
        対象定期契約者数: <strong>{totalSubscribers.toLocaleString()}</strong>人 ／ 共通比較回数(このセグメント一覧内で最も浅いセグメントに揃えた基準):{" "}
        <strong>{commonN}回目</strong>
      </p>

      <div className="mb-2 flex items-center justify-end">
        <CsvExportButton
          filename={`定期分析新_${axis}.csv`}
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
            {rowsWithDerived.map(({ row, curve, projected, commonRate }) => (
              <tr key={row.segment} className="align-top hover:bg-neutral-50">
                <td className="px-4 py-2 font-medium">
                  <details>
                    <summary className="cursor-pointer">{row.segment}</summary>
                    <SegmentDetail
                      row={row}
                      curve={curve}
                      axis={axis}
                      profiles={profiles}
                      customersById={customersById}
                      ctx={ctx}
                      statusByOrderId={statusByOrderId}
                      survivalSum={curve.reduce((sum, p) => sum + p.forecast / 100, 0)}
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

      <ul className="mt-3 space-y-0.5 text-xs text-neutral-400">
        <li>固有到達回数: セグメントの起点(最古の初回定期注文日)からの経過期間 ÷ 代表的なお届け頻度で決まる、確定値として語れる最大到達回数</li>
        <li>共通比較回数: 表示中のセグメントのうち最も浅い固有到達回数に揃えた基準。この列だけが公平な比較に使える確定値</li>
        <li>予測LTV: 確定済みの残存率カーブを{HORIZON}回目まで自動延長(確定済み全回次間の移行率の幾何平均、無ければ全体平均で代用)して算出。セグメント行の▸をクリックすると、回次ごとの確定値/予測値の内訳と顧客明細が見られます</li>
      </ul>
    </div>
  );
}

function SegmentDetail({
  row,
  curve,
  axis,
  profiles,
  customersById,
  ctx,
  statusByOrderId,
  survivalSum,
}: {
  row: SegmentReliabilityRow;
  curve: ReturnType<typeof buildRetentionCurve>;
  axis: SegmentAxis;
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
    return resolveSegmentLabel(axis, p.firstSubOrder, customer, ctx) === row.segment;
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
        <p className="mb-1 text-xs font-semibold text-neutral-600">残存率カーブ(確定値 / 予測値・自動更新モデル)</p>
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full min-w-[420px] text-xs">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-3 py-1.5 text-left">回数</th>
                <th className="px-3 py-1.5 text-right">確定値</th>
                <th className="px-3 py-1.5 text-right">予測値</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {curve.map((p) => (
                <tr key={p.n}>
                  <td className="px-3 py-1.5">{p.n}回目</td>
                  <td className="px-3 py-1.5 text-right">{p.confirmed === null ? "—" : formatPercent(p.confirmed)}</td>
                  <td className="px-3 py-1.5 text-right text-neutral-500">{formatPercent(p.forecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
