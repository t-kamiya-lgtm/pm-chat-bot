import { NextResponse } from "next/server";
import { deferredCheckoutSchema } from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { upsertCustomer } from "@/lib/customers";
import { getPaymentFee, calculateTotal } from "@/lib/fees";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";
import { assignCustomerNumberIfNeeded } from "@/lib/customer-number";
import { generateOrderNumber } from "@/lib/order-number";
import { resolveApplicableCoupon, recordCouponUsage } from "@/lib/coupons";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import { resolveOrderCostSnapshot } from "@/lib/order-cost-snapshot";

/**
 * 後払い(スコアあと払い)・代金引換の注文受付。
 * 与信・請求は行わず、基幹システム連携アダプタ経由で顧客情報・注文内容を連携するのみ。
 * スマレジへのリアルタイム連携は行わない(スマレジ連携は廃止し、Stripe注文と同様に
 * スタッフが受注データをCSV書き出し→基幹システム「通販ゲート」へ手動取り込みする運用に統一)。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = deferredCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const {
    productId,
    quantity,
    orderType,
    subscriptionInterval,
    paymentMethod,
    customer: customerInput,
    deliveryDate,
    deliveryTimeSlot,
    invoiceNote,
    addonProductId,
    shippingAddress,
    surveyResponses,
    scenarioId,
    sessionId,
    utmSource,
    utmMedium,
    utmCampaign,
    couponCode,
    setSelections,
  } = parsed.data;

  if (orderType === "subscription" && !subscriptionInterval) {
    return NextResponse.json(
      { error: "subscriptionInterval is required for subscription orders" },
      { status: 400 },
    );
  }

  const product = await getProductById(productId);
  if (!product) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }
  if (orderType === "subscription") {
    if (
      product.order_type !== "subscription" ||
      !subscriptionInterval ||
      !product.subscription_intervals.includes(subscriptionInterval)
    ) {
      return NextResponse.json(
        { error: "product does not support this subscription interval" },
        { status: 400 },
      );
    }
  }

  // 「お試し→本品自動切替」プランの場合、本品(2回目以降の品番)を解決する。
  const nextCycleProduct =
    orderType === "subscription" && product.next_cycle_product_id
      ? await getProductById(product.next_cycle_product_id)
      : null;

  const addonProduct = addonProductId ? await getProductById(addonProductId) : null;
  const addonAmount = addonProduct?.price ?? 0;
  // アドオン商品自体も定期購入対応で、メインと同じ周期に対応している場合は、単発の追加購入ではなく
  // メインと同じ周期のもう1つの定期便として同時に申し込む。
  const addonIsSubscription =
    orderType === "subscription" &&
    !!subscriptionInterval &&
    addonProduct?.order_type === "subscription" &&
    addonProduct.subscription_intervals.includes(subscriptionInterval);

  // amountは常に通常価格で記録する(Stripeの定期Priceと同様、2回目以降の基準額として使うため)。
  // 初回価格が設定されている場合は、その差額を「初回のみの一括値引き」として扱う
  // (スマレジへの連携も、明細は通常価格のまま、値引き額として送る)。
  const amount = product.price * quantity;
  const regularAmount = nextCycleProduct ? nextCycleProduct.price * quantity : amount;
  const firstTimeDiscountAmount = nextCycleProduct
    ? Math.max(0, regularAmount - amount)
    : orderType === "subscription" && product.first_time_price !== null
      ? Math.max(0, amount - product.first_time_price * quantity)
      : 0;
  const paymentFee = await getPaymentFee(paymentMethod, orderType);

  const supabase = createSupabaseAdminClient();
  const appliedCoupon = await resolveApplicableCoupon(supabase, {
    scenarioId,
    code: couponCode,
    subtotal: amount + addonAmount,
    cartProductIds: [productId, addonProductId].filter((id): id is string => Boolean(id)),
  });
  const breakdown = calculateTotal(
    amount + addonAmount,
    product.shipping_fee,
    paymentFee,
    (appliedCoupon?.discountAmount ?? 0) + firstTimeDiscountAmount,
  );

  const customer = await upsertCustomer(customerInput);
  const orderNumber = await generateOrderNumber(supabase, scenarioId);
  const costSnapshot = await resolveOrderCostSnapshot(supabase, productId, new Date().toISOString());
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customer.id,
      product_id: productId,
      scenario_id: scenarioId ?? null,
      order_number: orderNumber,
      session_id: sessionId ?? null,
      type: orderType,
      payment_method: paymentMethod,
      amount,
      quantity,
      shipping_fee: product.shipping_fee,
      payment_fee: paymentFee,
      status: "pending",
      ...costSnapshot,
      // import_statusはデフォルト(not_imported)のまま作成する。Stripe注文と同様、
      // スタッフが通販ゲートCSV書き出し・出荷報告CSV取込を行うことで進めていく。
      delivery_date: deliveryDate || null,
      delivery_time_slot: deliveryTimeSlot || null,
      invoice_note: invoiceNote || null,
      agreed_terms_at: new Date().toISOString(),
      addon_product_id: addonProduct?.id ?? null,
      addon_amount: addonProduct ? addonAmount : null,
      is_addon_subscription: Boolean(addonProduct && addonIsSubscription),
      shipping_address: shippingAddress ?? null,
      survey_responses: surveyResponses ?? null,
      utm_source: utmSource ?? null,
      utm_medium: utmMedium ?? null,
      utm_campaign: utmCampaign ?? null,
      coupon_id: appliedCoupon?.id ?? null,
      coupon_code: appliedCoupon?.code ?? null,
      discount_amount: appliedCoupon?.discountAmount ?? 0,
      first_time_discount_amount: firstTimeDiscountAmount || null,
      set_selections: setSelections ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (orderType === "subscription" && subscriptionInterval) {
    const nextBillingDate = new Date();
    nextBillingDate.setDate(nextBillingDate.getDate() + SUBSCRIPTION_INTERVAL_DAYS[subscriptionInterval]);
    await supabase.from("subscriptions").insert({
      order_id: order.id,
      interval: subscriptionInterval,
      status: "active",
      next_billing_date: nextBillingDate.toISOString().slice(0, 10),
      // 自動切替プランの場合、2回目以降は本品の品番・価格・送料で生成されるよう、この時点で
      // 上書き設定しておく(初回注文自体の記録は変更しない)。
      ...(nextCycleProduct && {
        override_product_id: nextCycleProduct.id,
        override_amount: regularAmount,
        override_shipping_fee: nextCycleProduct.shipping_fee,
      }),
    });
  }

  const coreSystem = getCoreSystemAdapter();
  const { accepted } = await coreSystem.submitOrder({
    orderId: order.id,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address!,
    },
    orderType,
    paymentMethod,
    product: { id: productId, quantity },
    subscriptionInterval,
    amount,
    shippingFee: product.shipping_fee,
    paymentFee,
    addonProduct: addonProduct ? { id: addonProduct.id, amount: addonAmount } : undefined,
    shippingAddress: shippingAddress ?? undefined,
  });

  await supabase
    .from("orders")
    .update({ status: accepted ? "accepted" : "failed" })
    .eq("id", order.id);

  if (accepted) {
    await sendOrderCompletionEmail(order.id);
    await assignCustomerNumberIfNeeded(customer.id);
    if (appliedCoupon) {
      await recordCouponUsage(supabase, appliedCoupon.id);
    }
  }

  // このセッションの離脱リードが実際には注文につながったことを記録する(以後、別注文で上書きしない)。
  if (sessionId) {
    await supabase.from("leads").update({ order_status: "ordered" }).eq("session_id", sessionId);
  }

  return NextResponse.json({ orderId: order.id, accepted, breakdown });
}
