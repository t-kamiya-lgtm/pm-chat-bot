import { and, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coupons, scenarios, orders } from "@/db/schema";
import { CouponsTable, type CouponRow } from "@/components/admin/CouponsTable";
import { CouponUsageReportView } from "@/components/admin/CouponUsageReportView";
import { TabbedPanels } from "@/components/admin/TabbedPanels";
import { buildCouponUsageReport, type CouponUsageOrderRow } from "@/lib/coupon-usage-report";

export const dynamic = "force-dynamic";

const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];

function currentMonthJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
}

function isValidMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

/**
 * クーポン一覧。シナリオに自動適用するクーポン(scenario_auto)と
 * お客様が手入力するクーポンコード(manual_code)の両方をまとめて表示する。
 * scenario_autoの実体の編集はシナリオ編集画面で行うため、こちらでは
 * 一覧・停止・削除・実績確認のみを行う。「クーポン管理」「クーポン実績」の
 * 2タブに分けており、実績タブでは月ごとの日別・クーポン種別の利用額集計を表示する。
 */
export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : currentMonthJst();
  const tab = sp.tab === "usage" ? "usage" : undefined;

  const monthStart = `${month}-01T00:00:00+09:00`;
  const [monthYear, monthNum] = month.split("-").map(Number);
  const nextMonthDate = new Date(monthYear, monthNum, 1);
  const monthEnd = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01T00:00:00+09:00`;

  let rows: CouponRow[] = [];
  let scenarioOptions: { id: string; name: string }[] = [];
  let usageOrderRows: CouponUsageOrderRow[] = [];
  let error: string | null = null;
  let usageError: string | null = null;

  try {
    const db = await getDb();
    const [couponRows, scenarioRows] = await Promise.all([
      db.query.coupons.findMany({
        orderBy: [desc(coupons.createdAt)],
        with: {
          scenario: { columns: { id: true, name: true } },
        },
      }),
      db.select({ id: scenarios.id, name: scenarios.name }).from(scenarios).orderBy(scenarios.name),
    ]);
    scenarioOptions = scenarioRows;

    rows = couponRows.map((c) => ({
      id: c.id,
      type: c.type as CouponRow["type"],
      code: c.code,
      name: c.name,
      discountType: c.discountType as CouponRow["discountType"],
      discountValue: c.discountValue,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      minOrderAmount: c.minOrderAmount,
      isActive: c.isActive,
      scenarioId: c.scenarioId,
      scenarioName: c.scenario?.name ?? null,
      createdAt: c.createdAt,
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  try {
    const db = await getDb();
    const usageOrders = await db
      .select({
        createdAt: orders.createdAt,
        discountAmount: orders.discountAmount,
        couponType: coupons.type,
      })
      .from(orders)
      .leftJoin(coupons, eq(orders.couponId, coupons.id))
      .where(
        and(
          isNotNull(orders.couponId),
          inArray(orders.status, CONFIRMED_ORDER_STATUSES),
          gte(orders.createdAt, monthStart),
          lt(orders.createdAt, monthEnd),
        ),
      );

    usageOrderRows = usageOrders.map((o) => ({
      created_at: o.createdAt,
      discount_amount: o.discountAmount ?? 0,
      coupon_type: (o.couponType ?? "manual_code") as CouponUsageOrderRow["coupon_type"],
    }));
  } catch (err) {
    usageError = err instanceof Error ? err.message : String(err);
  }

  const usageReport = buildCouponUsageReport(usageOrderRows, month);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">クーポン</h1>
        <p className="mt-1 text-sm text-neutral-500">
          シナリオに自動適用するクーポンと、お客様が決済確認画面で入力するクーポンコード(インフルエンサーごとの計測等)をまとめて表示します。
          シナリオ自動適用クーポンの内容編集は、各シナリオの編集画面「クーポン設定」から行ってください。
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          クーポン一覧の取得に失敗しました({error})
        </p>
      )}
      {usageError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          クーポン実績の取得に失敗しました({usageError})
        </p>
      )}

      <TabbedPanels
        initialActiveKey={tab}
        tabs={[
          {
            key: "manage",
            label: "クーポン管理",
            content: <CouponsTable initialCoupons={rows} scenarios={scenarioOptions} />,
          },
          {
            key: "usage",
            label: "クーポン実績",
            content: <CouponUsageReportView month={month} report={usageReport} />,
          },
        ]}
      />
    </div>
  );
}
