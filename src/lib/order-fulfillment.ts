import { syncOrderToSmaregi } from "@/lib/smaregi-order-sync";

/**
 * 後払い/代引き受理後に行う、スマレジEC・リピートへの受注連携。
 * Stripe決済の注文はチャットシステム内の受注管理のみで完結させるため、この処理は呼び出さない。
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  await syncOrderToSmaregi(orderId);
}
