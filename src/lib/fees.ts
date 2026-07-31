import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const supabase = createSupabaseAdminClient();

  // まず注文タイプ固有の設定を探し、なければ共通設定(order_type = null)を使う
  const { data: specific } = await supabase
    .from("payment_method_fees")
    .select("fee")
    .eq("payment_method", paymentMethod)
    .eq("order_type", orderType)
    .maybeSingle();

  if (specific) return specific.fee as number;

  const { data: common } = await supabase
    .from("payment_method_fees")
    .select("fee")
    .eq("payment_method", paymentMethod)
    .is("order_type", null)
    .maybeSingle();

  return (common?.fee as number) ?? 0;
}

export interface AmountBreakdown {
  amount: number;
  shippingFee: number;
  paymentFee: number;
  total: number;
}

export function calculateTotal(
  amount: number,
  shippingFee: number,
  paymentFee: number,
): AmountBreakdown {
  return {
    amount,
    shippingFee,
    paymentFee,
    total: amount + shippingFee + paymentFee,
  };
}
