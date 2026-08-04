import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Address, OrderType, ShippingAddress, SubscriptionInterval } from "@/lib/types";

export type CoreSystemPaymentMethod = "deferred_invoice" | "cod";

export interface CoreSystemOrderInput {
  orderId: string;
  customer: {
    name: string;
    email: string;
    phone: string | null;
    address: Address;
  };
  orderType: OrderType;
  paymentMethod: CoreSystemPaymentMethod;
  product: { id: string; quantity: number };
  subscriptionInterval?: SubscriptionInterval;
  amount: number; // 商品代金
  shippingFee: number; // 商品ごとに設定された送料
  paymentFee: number; // payment_method_fees から算出した手数料
  addonProduct?: { id: string; amount: number }; // クロスセルで追加された商品(任意)
  shippingAddress?: ShippingAddress; // 注文者と別の届け先(任意、未指定時は注文者住所と同じ)
}

/**
 * docs/requirements.md 6.2 基幹システム連携アダプタ(スコアあと払い・代金引換)
 * 与信判定・請求書発行・入金確認・定期注文の継続課金はすべて基幹システム側の責務。
 * 本システムは submitOrder で注文データを渡すところまでを担う。
 */
export interface CoreSystemAdapter {
  submitOrder(order: CoreSystemOrderInput): Promise<{ accepted: boolean }>;
}

/**
 * MVP用のモック実装。実際の基幹システムAPI呼び出しは行わず、
 * 送信内容を core_system_sync_logs に記録し、常に受理(accepted)を返す。
 */
export class MockCoreSystemAdapter implements CoreSystemAdapter {
  async submitOrder(order: CoreSystemOrderInput): Promise<{ accepted: boolean }> {
    const supabase = createSupabaseAdminClient();
    await supabase.from("core_system_sync_logs").insert({
      order_id: order.orderId,
      payload: order,
      status: "ok",
    });
    return { accepted: true };
  }
}

export function getCoreSystemAdapter(): CoreSystemAdapter {
  // TODO: 基幹システムの連携方式(REST API/ファイル連携等)確定後、本実装に切り替える
  return new MockCoreSystemAdapter();
}
