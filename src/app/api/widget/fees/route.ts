import { NextResponse } from "next/server";
import { getPaymentFee } from "@/lib/fees";
import type { OrderType, PaymentMethod } from "@/lib/types";

/** チャットウィジェットの金額プレビュー用: 決済手段・注文タイプに応じた手数料を返す(認証不要)。 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paymentMethod = searchParams.get("paymentMethod") as PaymentMethod | null;
  const orderType = searchParams.get("orderType") as OrderType | null;

  if (!paymentMethod || !orderType) {
    return NextResponse.json({ error: "paymentMethod and orderType are required" }, { status: 400 });
  }

  const fee = await getPaymentFee(paymentMethod, orderType);
  return NextResponse.json({ fee });
}
