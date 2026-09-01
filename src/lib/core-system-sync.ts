import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders, subscriptions } from "@/db/schema";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import type { Address, OrderType, ShippingAddress, SubscriptionInterval } from "@/lib/types";
import type { Db } from "@/lib/db";

/**
 * Stripe決済で確定した注文(単品/定期初回/定期2回目以降のいずれも)を、
 * チャットシステムから基幹システムへ取り込むための連携。
 * Stripeは決済・与信そのものを担うため、ここでは「決済済みの注文データを渡す」通知として使う
 * (後払い・代引きのsubmitOrderが担う与信判定とは役割が異なる)。
 * すべての注文は支払方法を問わず基幹システムへ取り込む必要があるため、Stripe決済の注文にも適用する。
 */
export async function submitStripeOrderToCoreSystem(orderId: string): Promise<void> {
  const db = await getDb();
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;

    const [[customer], [subscription]] = await Promise.all([
      db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1),
      order.type === "subscription"
        ? db
            .select({ interval: subscriptions.interval })
            .from(subscriptions)
            .where(eq(subscriptions.orderId, order.parentOrderId ?? order.id))
            .limit(1)
        : Promise.resolve([null]),
    ]);
    if (!customer) return;

    const coreSystem = getCoreSystemAdapter();
    const result = await coreSystem.submitOrder({
      orderId: order.id,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address as Address,
      },
      orderType: order.type as OrderType,
      paymentMethod: "stripe",
      product: { id: order.productId, quantity: order.quantity },
      subscriptionInterval: subscription?.interval as SubscriptionInterval | undefined,
      amount: order.amount,
      shippingFee: order.shippingFee,
      paymentFee: order.paymentFee,
      addonProduct: order.addonProductId ? { id: order.addonProductId, amount: order.addonAmount ?? 0 } : undefined,
      shippingAddress: (order.shippingAddress as ShippingAddress | null) ?? undefined,
    });
    if (!result.accepted) {
      await markImportError(db, orderId);
    }
  } catch (err) {
    console.error("[core-system-sync] failed to submit stripe order", { orderId, err });
    await markImportError(db, orderId);
  }
}

/**
 * 基幹システムへの取り込みに失敗した注文を「取込みエラー」として扱う。
 * 新規の受注ステータス値は追加せず、既存のimport_errorを流用する
 * (フルフィルスタッフが管理画面のピンク表示で気づき、手動で取り込みし直す運用)。
 * 担当者がすでに手動でステータスを進めている場合(not_imported以外)は上書きしない。
 */
async function markImportError(db: Db, orderId: string) {
  await db
    .update(orders)
    .set({ importStatus: "import_error", importStatusUpdatedAt: new Date().toISOString() })
    .where(and(eq(orders.id, orderId), eq(orders.importStatus, "not_imported")));
}
