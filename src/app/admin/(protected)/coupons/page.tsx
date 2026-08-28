import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const supabase = createSupabaseAdminClient();
  const [{ data: coupons, error }, { data: scenarios }, { data: usageOrders, error: usageError }] = await Promise.all([
    supabase
      .from("coupons")
      .select("*, scenarios(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("scenarios").select("id, name").order("name"),
    supabase
      .from("orders")
      .select("created_at, discount_amount, coupons(type)")
      .not("coupon_id", "is", null)
      .in("status", CONFIRMED_ORDER_STATUSES)
      .gte("created_at", monthStart)
      .lt("created_at", monthEnd),
  ]);

  const rows: CouponRow[] = (coupons ?? []).map((c) => {
    const scenario = c.scenarios as { id: string; name: string } | null;
    return {
      id: c.id,
      type: c.type,
      code: c.code,
      name: c.name,
      discountType: c.discount_type,
      discountValue: c.discount_value,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      maxUses: c.max_uses,
      usedCount: c.used_count,
      minOrderAmount: c.min_order_amount,
      isActive: c.is_active,
      scenarioId: c.scenario_id,
      scenarioName: scenario?.name ?? null,
      createdAt: c.created_at,
    };
  });

  const usageOrderRows: CouponUsageOrderRow[] = (usageOrders ?? []).map((o) => {
    const joined = o.coupons as unknown;
    const coupon = (Array.isArray(joined) ? joined[0] : joined) as { type: "scenario_auto" | "manual_code" } | null;
    return {
      created_at: o.created_at as string,
      discount_amount: (o.discount_amount as number) ?? 0,
      coupon_type: coupon?.type ?? "manual_code",
    };
  });
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
          クーポン一覧の取得に失敗しました({error.message})
        </p>
      )}
      {usageError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          クーポン実績の取得に失敗しました({usageError.message})
        </p>
      )}

      <TabbedPanels
        initialActiveKey={tab}
        tabs={[
          {
            key: "manage",
            label: "クーポン管理",
            content: <CouponsTable initialCoupons={rows} scenarios={scenarios ?? []} />,
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
