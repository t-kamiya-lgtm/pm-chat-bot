import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import type { CustomerRow } from "@/lib/customers";

/**
 * Stripe決済で確定した注文(単品/定期初回/定期2回目以降のいずれも)を、
 * チャットシステムから基幹システムへ取り込むための連携。
 * Stripeは決済・与信そのものを担うため、ここでは「決済済みの注文データを渡す」通知として使う
 * (後払い・代引きのsubmitOrderが担う与信判定とは役割が異なる)。
 * すべての注文は支払方法を問わず基幹システムへ取り込む必要があるため、Stripe決済の注文にも適用する。
 */
export async function submitStripeOrderToCoreSystem(orderId: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) return;

    const [{ data: customer }, { data: subscription }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", order.customer_id).maybeSingle(),
      order.type === "subscription"
        ? supabase
            .from("subscriptions")
            .select("interval")
            .eq("order_id", order.parent_order_id ?? order.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!customer) return;
    const customerRow = customer as CustomerRow;

    const coreSystem = getCoreSystemAdapter();
    await coreSystem.submitOrder({
      orderId: order.id,
      customer: {
        name: customerRow.name,
        email: customerRow.email,
        phone: customerRow.phone,
        address: customerRow.address!,
      },
      orderType: order.type,
      paymentMethod: "stripe",
      product: { id: order.product_id, quantity: order.quantity },
      subscriptionInterval: subscription?.interval,
      amount: order.amount,
      shippingFee: order.shipping_fee,
      paymentFee: order.payment_fee,
      addonProduct: order.addon_product_id
        ? { id: order.addon_product_id, amount: order.addon_amount ?? 0 }
        : undefined,
      shippingAddress: order.shipping_address ?? undefined,
    });
  } catch (err) {
    console.error("[core-system-sync] failed to submit stripe order", { orderId, err });
  }
}
