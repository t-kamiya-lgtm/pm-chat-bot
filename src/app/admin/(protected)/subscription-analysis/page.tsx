import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveScenarioBrandId } from "@/lib/brand-resolution";
import {
  buildCustomerProfiles,
  buildLtvRanking,
  buildConversionRanking,
  SEGMENT_AXES,
  type LtvOrderRow,
  type LtvCustomerRow,
  type BundleSetCriteria,
  type SegmentContext,
  type SegmentAxis,
  type LtvSegmentRow,
  type ConversionSegmentRow,
} from "@/lib/subscription-ltv";
import { SubscriptionLtvRanking } from "@/components/admin/SubscriptionLtvRanking";
import { CombinedSegmentAnalysis } from "@/components/admin/CombinedSegmentAnalysis";
import { PrintButton } from "@/components/admin/PrintButton";
import { buildLifetimeAndAnnualLtv, type LifetimeLtvOrderRow } from "@/lib/customer-lifetime-ltv";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";

function formatYenFloor(amount: number): string {
  return `${Math.floor(amount).toLocaleString()}円`;
}

export const dynamic = "force-dynamic";

const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];

export default async function AdminSubscriptionAnalysisPage({
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
  const combineParam = sp["combine"];
  const validAxisKeys = new Set(SEGMENT_AXES.map((a) => a.key));
  const combineAxes = (Array.isArray(combineParam) ? combineParam : combineParam ? [combineParam] : []).filter(
    (v): v is SegmentAxis => validAxisKeys.has(v as SegmentAxis),
  );

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
    supabase.from("customers").select("id, gender, birth_date"),
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
    supabase.from("subscriptions").select("order_id, interval"),
    supabase
      .from("bundle_insert_sets")
      .select("id, name, brand_id, period_start, period_end, target_order_type, target_cycle_numbers, target_product_ids"),
    supabase.from("customer_retention_actions").select("customer_id"),
  ]);

  const customersById = new Map((customers ?? []).map((c) => [c.id as string, c as LtvCustomerRow]));
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

  const ltvRankingsByAxis = {} as Record<SegmentAxis, LtvSegmentRow[]>;
  const conversionRankingsByAxis = {} as Record<SegmentAxis, ConversionSegmentRow[]>;
  for (const { key } of SEGMENT_AXES) {
    ltvRankingsByAxis[key] = buildLtvRanking(profiles, customersById, key, ctx);
    conversionRankingsByAxis[key] = buildConversionRanking(profiles, customersById, key, ctx);
  }

  const totalSubscribers = profiles.filter((p) => p.isSubscriber).length;

  // 生涯LTV・年間LTVは「これまでの蓄積実績の全体像」を示すための指標なので、
  // 画面下部の獲得日フィルタ(dateFrom/dateTo)の影響を受けず常に全期間で計算する
  // (orderRowsはprofilesと違い獲得日フィルタ適用前のため、ブランド絞り込みのみが効く)。
  const lifetimeAndAnnualLtv = buildLifetimeAndAnnualLtv(
    orderRows as unknown as LifetimeLtvOrderRow[],
    new Date().toISOString(),
    intervalByOrderId,
    SUBSCRIPTION_INTERVAL_DAYS,
  );

  const combinedLtvRows = combineAxes.length >= 2 ? buildLtvRanking(profiles, customersById, combineAxes, ctx) : [];
  const combinedConversionRows =
    combineAxes.length >= 2 ? buildConversionRanking(profiles, customersById, combineAxes, ctx) : [];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">定期分析</h1>
        <PrintButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        セグメント別に、定期契約者のLTV(定期LTV = 期間内に存在した定期契約者の定期関連売上合計 ÷
        人数)と、単品購入から定期への引き上げ率をランキング表示します。回数(1回目・2回目…)の系列は定期購入のみで数え、単品購入は「単品→定期引き上げ率」として別軸で扱います(単品は0回目として数えません)。
      </p>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-700">蓄積実績LTV(確定値・全期間{brandId ? "・このブランドのみ" : "・全ブランド"})</h2>
          <p className="text-xs text-neutral-400">
            下部の獲得日絞り込みの影響を受けません。年間LTVは、お届け頻度別の到達回数(1ヶ月ごと=12回・2ヶ月ごと=6回・2週間ごと=24回、単品のみの顧客は365日)に到達した時点の実績で固定し、それ以降の実績では更新しません(翌月以降、新たに到達した顧客から順次加算)。頻度を途中で変更した顧客は、獲得時点の頻度(実測できる場合は初回→2回目の実際の間隔から判定)を基準にします。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <LtvSummaryCard label="生涯LTV(売上)" value={formatYenFloor(lifetimeAndAnnualLtv.lifetimeRevenueLtv)} sub={`対象 ${lifetimeAndAnnualLtv.lifetimeCustomerCount.toLocaleString()}人`} />
          <LtvSummaryCard label="生涯LTV(増分利益)" value={formatYenFloor(lifetimeAndAnnualLtv.lifetimeIncrementalProfitLtv)} sub={`対象 ${lifetimeAndAnnualLtv.lifetimeCustomerCount.toLocaleString()}人`} />
          <LtvSummaryCard label="年間LTV(売上)" value={formatYenFloor(lifetimeAndAnnualLtv.annualRevenueLtv)} sub={`対象 ${lifetimeAndAnnualLtv.annualCustomerCount.toLocaleString()}人`} />
          <LtvSummaryCard label="年間LTV(増分利益)" value={formatYenFloor(lifetimeAndAnnualLtv.annualIncrementalProfitLtv)} sub={`対象 ${lifetimeAndAnnualLtv.annualCustomerCount.toLocaleString()}人`} />
        </div>
      </div>

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
        <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          絞り込む
        </button>
        {combineAxes.map((axis) => (
          <input key={axis} type="hidden" name="combine" value={axis} />
        ))}
      </form>

      <p className="mb-4 text-sm text-neutral-600">
        対象定期契約者数: <strong>{totalSubscribers.toLocaleString()}</strong>人
      </p>

      <SubscriptionLtvRanking ltvRankingsByAxis={ltvRankingsByAxis} conversionRankingsByAxis={conversionRankingsByAxis} />

      <div className="mt-8">
        <CombinedSegmentAnalysis
          selectedAxes={combineAxes}
          ltvRows={combinedLtvRows}
          conversionRows={combinedConversionRows}
          dateFrom={dateFrom}
          dateTo={dateTo}
          brandId={brandId}
        />
      </div>
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
