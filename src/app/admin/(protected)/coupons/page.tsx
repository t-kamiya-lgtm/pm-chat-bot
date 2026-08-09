import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CouponsTable, type CouponRow } from "@/components/admin/CouponsTable";

export const dynamic = "force-dynamic";

/**
 * インフルエンサー計測用など、お客様が手入力するクーポンコード(manual_code)の管理画面。
 * シナリオに自動適用するクーポン(scenario_auto)はシナリオ編集画面で管理する。
 */
export default async function AdminCouponsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: coupons, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("type", "manual_code")
    .order("created_at", { ascending: false });

  const rows: CouponRow[] = (coupons ?? []).map((c) => ({
    id: c.id,
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
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">クーポン</h1>
        <p className="mt-1 text-sm text-neutral-500">
          お客様が決済確認画面で入力するクーポンコードです(インフルエンサーごとの計測等に利用)。
          シナリオに自動適用するクーポンは、各シナリオの編集画面「クーポン設定」から登録してください。
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          クーポン一覧の取得に失敗しました({error.message})
        </p>
      )}

      <CouponsTable initialCoupons={rows} />
    </div>
  );
}
