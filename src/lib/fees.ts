import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentMethodFees } from "@/db/schema";
import type { OrderType, PaymentMethod } from "@/lib/types";

/**
 * payment_method_fees テーブルから、決済手段・注文タイプに応じた手数料を取得する。
 * stripe(即時決済)は手数料なしの0円を返す。
 */
export async function getPaymentFee(
  paymentMethod: PaymentMethod,
  orderType: OrderType,
): Promise<number> {
  if (paymentMethod === "stripe") return 0;

  const db = await getDb();

  // まず注文タイプ固有の設定を探し、なければ共通設定(order_type = null)を使う
  const [specific] = await db
    .select({ fee: paymentMethodFees.fee })
    .from(paymentMethodFees)
    .where(and(eq(paymentMethodFees.paymentMethod, paymentMethod), eq(paymentMethodFees.orderType, orderType)))
    .limit(1);

  if (specific) return specific.fee;

  const [common] = await db
    .select({ fee: paymentMethodFees.fee })
    .from(paymentMethodFees)
    .where(and(eq(paymentMethodFees.paymentMethod, paymentMethod), isNull(paymentMethodFees.orderType)))
    .limit(1);

  return common?.fee ?? 0;
}

export interface AmountBreakdown {
  amount: number;
  shippingFee: number;
  paymentFee: number;
  discount: number;
  total: number;
}

export function calculateTotal(
  amount: number,
  shippingFee: number,
  paymentFee: number,
  discount: number = 0,
): AmountBreakdown {
  return {
    amount,
    shippingFee,
    paymentFee,
    discount,
    total: Math.max(0, amount + shippingFee + paymentFee - discount),
  };
}
