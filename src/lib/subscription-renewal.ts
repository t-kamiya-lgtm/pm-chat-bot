import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateOrderNumber } from "@/lib/order-number";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";
import { submitStripeOrderToCoreSystem } from "@/lib/core-system-sync";
import { getProductById } from "@/lib/products";
import { getPaymentFee } from "@/lib/fees";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import type { Address, SubscriptionInterval } from "@/lib/types";

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
        // Stripe注文はフルフィル担当が基幹システムへ手動で取り込むため、未取込みのまま生成する
        stripe_subscription_id: params.stripeSubscriptionId,
        stripe_payment_intent_id: params.invoiceId,
        delivery_date: original.delivery_date,
        delivery_time_slot: original.delivery_time_slot,
        agreed_terms_at: original.agreed_terms_at,
        shipping_address: original.shipping_address,
        parent_order_id: original.id,
        billing_cycle_number: nextCycleNumber,
        // アドオンが定期便として同時申込されている場合のみ、2回目以降の注文にも引き継ぐ
        // (単発アドオンは初回のみの一括請求だったため、従来通りここではコピーしない)。
        ...(original.is_addon_subscription && {
          addon_product_id: original.addon_product_id,
          addon_amount: original.addon_amount,
          is_addon_subscription: true,
        }),
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

/**
 * 代引き・後払いの定期購入について、次回お届け予定日が近づいた注文データを
 * チャットシステム側で新規生成する(/api/cron/subscription-renewalsから呼ばれる)。
 * スマレジ連携は廃止したため、Stripe注文の定期継続分と同様、生成した注文データは
 * スタッフが通販ゲートCSV書き出し・出荷報告CSV取込で進めていく(import_statusは
 * デフォルト(not_imported)のまま生成する)。
 * 与信判定は基幹システム側(coreSystem.submitOrder)が毎回の受注データ生成時に行う運用のため、
 * チャットシステム側では判定結果を受け取るだけでよい。
 */
export async function createDeferredSubscriptionRenewalOrder(subscriptionRowId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  try {
    const { data: subscriptionRow } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("id", subscriptionRowId)
      .maybeSingle();
    if (!subscriptionRow || subscriptionRow.status !== "active" || !subscriptionRow.next_billing_date) return;

    const { data: original } = await supabase
      .from("orders")
      .select("*")
      .eq("id", subscriptionRow.order_id)
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

    // 同じ周期の注文が既に生成済みであれば何もしない(Cronの多重実行対策)。
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("parent_order_id", original.id)
      .eq("billing_cycle_number", nextCycleNumber)
      .maybeSingle();
    if (existing) return;

    const product = await getProductById(original.product_id);
    if (!product) return;

    const quantity = original.quantity as number;
    // 2回目以降は常に通常価格(初回特別価格・クーポンは初回のみ適用)。
    const amount = product.price * quantity;
    const paymentFee = await getPaymentFee(original.payment_method, "subscription");
    const deliveryDate = subscriptionRow.next_billing_date as string;

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
        payment_method: original.payment_method,
        amount,
        quantity,
        shipping_fee: product.shipping_fee,
        payment_fee: paymentFee,
        status: "pending",
        delivery_date: deliveryDate,
        delivery_time_slot: original.delivery_time_slot,
        invoice_note: original.invoice_note,
        agreed_terms_at: original.agreed_terms_at,
        shipping_address: original.shipping_address,
        parent_order_id: original.id,
        billing_cycle_number: nextCycleNumber,
        // アドオンが定期便として同時申込されている場合のみ、2回目以降の注文にも引き継ぐ
        // (単発アドオンは初回のみの一括購入だったため、従来通りここではコピーしない)。
        ...(original.is_addon_subscription && {
          addon_product_id: original.addon_product_id,
          addon_amount: original.addon_amount,
          is_addon_subscription: true,
        }),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[subscription-renewal] failed to create deferred renewal order", error);
      return;
    }

    // 受注データの生成に成功した時点で、後続処理(与信・スマレジ連携)の成否に関わらず
    // 次回の予定日を進める(1周期分の失敗で以後のスケジュールが止まらないようにするため)。
    const interval = subscriptionRow.interval as SubscriptionInterval;
    const nextDate = new Date(deliveryDate);
    nextDate.setDate(nextDate.getDate() + SUBSCRIPTION_INTERVAL_DAYS[interval]);
    await supabase
      .from("subscriptions")
      .update({ next_billing_date: nextDate.toISOString().slice(0, 10) })
      .eq("id", subscriptionRowId);

    const { data: customer } = await supabase
      .from("customers")
      .select("name, email, phone, address")
      .eq("id", original.customer_id)
      .maybeSingle();
    if (!customer) return;

    const coreSystem = getCoreSystemAdapter();
    const { accepted } = await coreSystem.submitOrder({
      orderId: newOrder.id,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address as Address,
      },
      orderType: "subscription",
      paymentMethod: original.payment_method,
      product: { id: original.product_id, quantity },
      amount,
      shippingFee: product.shipping_fee,
      paymentFee,
      addonProduct:
        original.is_addon_subscription && original.addon_product_id
          ? { id: original.addon_product_id, amount: original.addon_amount ?? 0 }
          : undefined,
      shippingAddress: original.shipping_address ?? undefined,
    });

    await supabase
      .from("orders")
      .update({ status: accepted ? "accepted" : "failed" })
      .eq("id", newOrder.id);

    if (accepted) {
      await sendOrderCompletionEmail(newOrder.id);
    }
  } catch (err) {
    console.error("[subscription-renewal] unexpected error (deferred)", { subscriptionRowId, err });
  }
}
