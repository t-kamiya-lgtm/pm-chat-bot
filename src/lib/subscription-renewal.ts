import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateOrderNumber } from "@/lib/order-number";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";
import { submitStripeOrderToCoreSystem } from "@/lib/core-system-sync";

/**
 * 定期購入(Stripe決済)の2回目以降の周期課金(invoice.paid, billing_reason=subscription_cycle)を
 * 受けて、チャットシステム内に今回分の注文データを生成する。
 * スマレジへの連携は行わないが、他の注文と同様に基幹システムへは取り込む。
 * 同一invoiceでWebhookが複数回届いても、既に生成済みなら何もしない。
 */
export async function createSubscriptionRenewalOrder(params: {
  stripeSubscriptionId: string;
  invoiceId: string;
}): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", params.invoiceId)
      .maybeSingle();
    if (existing) return;

    const { data: original } = await supabase
      .from("orders")
      .select("*")
      .eq("stripe_subscription_id", params.stripeSubscriptionId)
      .is("parent_order_id", null)
      .maybeSingle();
    if (!original) return;

    const { data: latestChild } = await supabase
      .from("orders")
      .select("billing_cycle_number")
      .eq("parent_order_id", original.id)
      .order("billing_cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextCycleNumber = (latestChild?.billing_cycle_number ?? original.billing_cycle_number ?? 1) + 1;

    const orderNumber = await generateOrderNumber(supabase, original.scenario_id);

    const { data: newOrder, error } = await supabase
      .from("orders")
      .insert({
        customer_id: original.customer_id,
        product_id: original.product_id,
        scenario_id: original.scenario_id,
        order_number: orderNumber,
        session_id: original.session_id,
        type: "subscription",
        payment_method: "stripe",
        amount: original.amount,
        quantity: original.quantity,
        shipping_fee: original.shipping_fee,
        payment_fee: original.payment_fee,
        status: "paid",
        import_status: "imported",
        import_status_updated_at: new Date().toISOString(),
        stripe_subscription_id: params.stripeSubscriptionId,
        stripe_payment_intent_id: params.invoiceId,
        delivery_date: original.delivery_date,
        delivery_time_slot: original.delivery_time_slot,
        agreed_terms_at: original.agreed_terms_at,
        shipping_address: original.shipping_address,
        parent_order_id: original.id,
        billing_cycle_number: nextCycleNumber,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[subscription-renewal] failed to create renewal order", error);
      return;
    }

    await sendOrderCompletionEmail(newOrder.id);
    await submitStripeOrderToCoreSystem(newOrder.id);
  } catch (err) {
    console.error("[subscription-renewal] unexpected error", { params, err });
  }
}
