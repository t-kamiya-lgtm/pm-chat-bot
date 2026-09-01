import { getDb } from "@/lib/db";
import { coreSystemSyncLogs } from "@/db/schema";
import type { Address, OrderType, ShippingAddress, SubscriptionInterval } from "@/lib/types";

export type CoreSystemPaymentMethod = "deferred_invoice" | "cod" | "stripe";

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
 * docs/requirements.md 6.2 基幹システム連携アダプタ。
 * 後払い・代金引換は与信判定・請求書発行・入金確認・定期注文の継続課金を基幹システム側が担う
 * (submitOrderは受注データを渡すところまでを担う)。
 * Stripe決済は与信・課金自体はStripe側で完結しているため、submitOrderは
 * 決済確定した注文データを基幹システムへ取り込むための通知として使う。
 * すべての注文(支払方法を問わず)は、最終的に基幹システムへ取り込まれる必要がある。
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
    const db = await getDb();
    await db.insert(coreSystemSyncLogs).values({
      orderId: order.orderId,
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
