import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  customers as customersTable,
  orders as ordersTable,
  scenarios as scenariosTable,
  brands as brandsTable,
  products as productsTable,
  scenarioAccessLogs,
  subscriptions as subscriptionsTable,
  bundleInsertSets,
  customerRetentionActions,
} from "@/db/schema";
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

  let customers: LtvCustomerRow[] = [];
  let orders: LtvOrderRow[] = [];
  let scenarios: { id: string; name: string; order_code: string | null }[] = [];
  let brands: { id: string; name: string; code: string | null }[] = [];
  let products: { id: string; name: string }[] = [];
  let accessLogs: { session_id: string; referrer: string | null }[] = [];
  let subscriptions: { order_id: string; interval: string }[] = [];
  let bundleSetsRaw: BundleSetCriteria[] = [];
  let retentionActions: { customer_id: string }[] = [];
  let loadError: string | null = null;

  try {
    const db = await getDb();
    [customers, orders, scenarios, brands, products, accessLogs, subscriptions, bundleSetsRaw, retentionActions] =
      await Promise.all([
        db
          .select({ id: customersTable.id, gender: customersTable.gender, birth_date: customersTable.birthDate })
          .from(customersTable),
        db
          .select({
            id: ordersTable.id,
            customer_id: ordersTable.customerId,
            scenario_id: ordersTable.scenarioId,
            product_id: ordersTable.productId,
            type: ordersTable.type,
            payment_method: ordersTable.paymentMethod,
            billing_cycle_number: ordersTable.billingCycleNumber,
            quantity: ordersTable.quantity,
            amount: ordersTable.amount,
            addon_amount: ordersTable.addonAmount,
            discount_amount: ordersTable.discountAmount,
            first_time_discount_amount: ordersTable.firstTimeDiscountAmount,
            shipping_fee: ordersTable.shippingFee,
            payment_fee: ordersTable.paymentFee,
            created_at: ordersTable.createdAt,
            session_id: ordersTable.sessionId,
            cost_amount: ordersTable.costAmount,
            bundle_insert_cost: ordersTable.bundleInsertCost,
            shipping_cost: ordersTable.shippingCost,
            sales_commission_amount: ordersTable.salesCommissionAmount,
          })
          .from(ordersTable)
          .where(inArray(ordersTable.status, CONFIRMED_ORDER_STATUSES))
          .then((rows) => rows as unknown as LtvOrderRow[]),
        db.select({ id: scenariosTable.id, name: scenariosTable.name, order_code: scenariosTable.orderCode }).from(scenariosTable),
        db.select({ id: brandsTable.id, name: brandsTable.name, code: brandsTable.code }).from(brandsTable).orderBy(brandsTable.name),
        db.select({ id: productsTable.id, name: productsTable.name }).from(productsTable),
        db.select({ session_id: scenarioAccessLogs.sessionId, referrer: scenarioAccessLogs.referrer }).from(scenarioAccessLogs),
        db.select({ order_id: subscriptionsTable.orderId, interval: subscriptionsTable.interval }).from(subscriptionsTable),
        db
          .select({
            id: bundleInsertSets.id,
            name: bundleInsertSets.name,
            brand_id: bundleInsertSets.brandId,
            period_start: bundleInsertSets.periodStart,
            period_end: bundleInsertSets.periodEnd,
            target_order_type: bundleInsertSets.targetOrderType,
            target_cycle_numbers: bundleInsertSets.targetCycleNumbers,
            target_product_ids: bundleInsertSets.targetProductIds,
          })
          .from(bundleInsertSets)
          .then((rows) => rows as unknown as BundleSetCriteria[]),
        db.select({ customer_id: customerRetentionActions.customerId }).from(customerRetentionActions),
      ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  const customersById = new Map(customers.map((c) => [c.id, c]));
  const scenarioNames = new Map(scenarios.map((s) => [s.id, s.name]));
  const scenarioOrderCodes = new Map(scenarios.map((s) => [s.id, s.order_code]));
  const brandCodeToId = new Map(brands.filter((b) => b.code).map((b) => [b.code!.toUpperCase(), b.id]));
  const brandNames = new Map(brands.map((b) => [b.id, b.name]));
  const productNames = new Map(products.map((p) => [p.id, p.name]));
  const referrerBySessionId = new Map(accessLogs.map((l) => [l.session_id, l.referrer]));
  const intervalByOrderId = new Map(subscriptions.map((s) => [s.order_id, s.interval]));
  const bundleSets: BundleSetCriteria[] = bundleSetsRaw;
  const customerIdsWithRetentionAction = new Set(retentionActions.map((r) => r.customer_id));

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

  let orderRows: LtvOrderRow[] = orders;

  if (brandId) {
    const scenarioIdsForBrand = new Set(
      scenarios.filter((s) => resolveScenarioBrandId(s.order_code, brandCodeToId) === brandId).map((s) => s.id),
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

      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          データの取得に失敗しました({loadError})
        </p>
      )}

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
