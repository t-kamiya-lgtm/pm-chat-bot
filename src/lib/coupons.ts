import { sql, eq, and, asc } from "drizzle-orm";
import { coupons } from "@/db/schema";
import type { Db } from "@/lib/db";

export interface AppliedCoupon {
  id: string;
  code: string | null;
  discountAmount: number;
}

type CouponRow = typeof coupons.$inferSelect;

/**
 * 適用可能なクーポンを解決する。
 * ①シナリオの自動適用クーポンと②お客様が入力した手入力コードは、
 * 運用上どちらか一方のみを設定する想定で併用制御は行わない。
 * 万一両方が成立してしまった場合のフェイルセーフとして、手入力コードを優先する。
 * 割引の対象は商品代金(amount + addonAmount)のみで、送料・決済手数料は対象外。
 * 対象商品が設定されているクーポンは、カート内の商品(メイン+クロスセル/アドオン)の
 * いずれかが対象に含まれていることをゲート条件として追加する。最低注文金額などの
 * 他の条件は、対象商品限定の有無に関わらず商品代金の合計に対して判定する
 * (対象外の商品との合計買いで金額条件を満たしても適用される)。
 */
export async function resolveApplicableCoupon(
  db: Db,
  {
    scenarioId,
    code,
    subtotal,
    cartProductIds,
  }: {
    scenarioId: string | null | undefined;
    code: string | null | undefined;
    subtotal: number;
    /** カート内の商品ID(メイン商品・クロスセル/アドオン商品)。対象商品限定クーポンの判定に使う。 */
    cartProductIds?: string[];
  },
): Promise<AppliedCoupon | null> {
  const trimmedCode = code?.trim();
  if (trimmedCode) {
    const [manual] = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.type, "manual_code"), eq(coupons.code, trimmedCode)))
      .limit(1);
    if (manual && isCouponUsable(manual, subtotal, cartProductIds)) {
      return { id: manual.id, code: manual.code, discountAmount: computeDiscount(manual, subtotal) };
    }
  }

  if (scenarioId) {
    const autoCoupons = await db
      .select()
      .from(coupons)
      .where(and(eq(coupons.type, "scenario_auto"), eq(coupons.scenarioId, scenarioId)))
      .orderBy(asc(coupons.createdAt));
    const applicable = autoCoupons.find((c) => isCouponUsable(c, subtotal, cartProductIds));
    if (applicable) {
      return { id: applicable.id, code: null, discountAmount: computeDiscount(applicable, subtotal) };
    }
  }

  return null;
}

function isCouponUsable(coupon: CouponRow, subtotal: number, cartProductIds?: string[]): boolean {
  if (!coupon.isActive) return false;
  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return false;
  if (coupon.endsAt && new Date(coupon.endsAt) < now) return false;
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return false;
  if (coupon.minOrderAmount !== null && subtotal < coupon.minOrderAmount) return false;
  const targetProductIds = coupon.targetProductIds;
  if (targetProductIds && targetProductIds.length > 0) {
    const inCart = cartProductIds ?? [];
    if (!targetProductIds.some((id) => inCart.includes(id))) return false;
  }
  return true;
}

function computeDiscount(coupon: CouponRow, subtotal: number): number {
  const raw =
    coupon.discountType === "percent" ? Math.round((subtotal * coupon.discountValue) / 100) : coupon.discountValue;
  return Math.max(0, Math.min(raw, subtotal));
}

export async function recordCouponUsage(db: Db, couponId: string): Promise<void> {
  await db.execute(sql`select increment_coupon_usage(${couponId})`);
}
