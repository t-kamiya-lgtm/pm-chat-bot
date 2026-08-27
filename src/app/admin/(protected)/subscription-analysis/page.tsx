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

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">定期分析</h1>
      <p className="mb-4 text-sm text-neutral-500">
        セグメント別に、定期契約者のLTV(定期LTV = 期間内に存在した定期契約者の定期関連売上合計 ÷
        人数)と、単品購入から定期への引き上げ率をランキング表示します。回数(1回目・2回目…)の系列は定期購入のみで数え、単品購入は「単品→定期引き上げ率」として別軸で扱います(単品は0回目として数えません)。
      </p>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
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
      </form>

      <p className="mb-4 text-sm text-neutral-600">
        対象定期契約者数: <strong>{totalSubscribers.toLocaleString()}</strong>人
      </p>

      <SubscriptionLtvRanking ltvRankingsByAxis={ltvRankingsByAxis} conversionRankingsByAxis={conversionRankingsByAxis} />
    </div>
  );
}
