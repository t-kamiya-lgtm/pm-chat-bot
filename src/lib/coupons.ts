import type { SupabaseClient } from "@supabase/supabase-js";

export interface AppliedCoupon {
  id: string;
  code: string | null;
  discountAmount: number;
}

/**
 * 適用可能なクーポンを解決する。
 * ①シナリオの自動適用クーポンと②お客様が入力した手入力コードは、
 * 運用上どちらか一方のみを設定する想定で併用制御は行わない。
 * 万一両方が成立してしまった場合のフェイルセーフとして、手入力コードを優先する。
 * 割引の対象は商品代金(amount + addonAmount)のみで、送料・決済手数料は対象外。
 */
export async function resolveApplicableCoupon(
  supabase: SupabaseClient,
  {
    scenarioId,
    code,
    subtotal,
  }: {
    scenarioId: string | null | undefined;
    code: string | null | undefined;
    subtotal: number;
  },
): Promise<AppliedCoupon | null> {
  const trimmedCode = code?.trim();
  if (trimmedCode) {
    const { data: manual } = await supabase
      .from("coupons")
      .select("*")
      .eq("type", "manual_code")
      .eq("code", trimmedCode)
      .maybeSingle();
    if (manual && isCouponUsable(manual, subtotal)) {
      return { id: manual.id, code: manual.code, discountAmount: computeDiscount(manual, subtotal) };
    }
  }

  if (scenarioId) {
    const { data: autoCoupons } = await supabase
      .from("coupons")
      .select("*")
      .eq("type", "scenario_auto")
      .eq("scenario_id", scenarioId)
      .order("created_at", { ascending: true });
    const applicable = (autoCoupons ?? []).find((c) => isCouponUsable(c, subtotal));
    if (applicable) {
      return { id: applicable.id, code: null, discountAmount: computeDiscount(applicable, subtotal) };
    }
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isCouponUsable(coupon: any, subtotal: number): boolean {
  if (!coupon.is_active) return false;
  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return false;
  if (coupon.ends_at && new Date(coupon.ends_at) < now) return false;
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) return false;
  if (coupon.min_order_amount !== null && subtotal < coupon.min_order_amount) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeDiscount(coupon: any, subtotal: number): number {
  const raw =
    coupon.discount_type === "percent"
      ? Math.round((subtotal * coupon.discount_value) / 100)
      : coupon.discount_value;
  return Math.max(0, Math.min(raw, subtotal));
}

export async function recordCouponUsage(supabase: SupabaseClient, couponId: string): Promise<void> {
  await supabase.rpc("increment_coupon_usage", { p_coupon_id: couponId });
}
