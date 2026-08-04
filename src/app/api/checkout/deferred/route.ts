import { NextResponse } from "next/server";
import { deferredCheckoutSchema } from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { upsertCustomer } from "@/lib/customers";
import { getPaymentFee, calculateTotal } from "@/lib/fees";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import { fulfillOrder } from "@/lib/order-fulfillment";

/**
 * 後払い(スコアあと払い)・代金引換の注文受付。
 * 与信・請求は行わず、基幹システム連携アダプタ経由で顧客情報・注文内容を連携するのみ。
 * 与信不要のため、受理後ただちに会員情報移行(スマレジ連携)まで行う。
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
    addonProductId,
    shippingAddress,
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

  const addonProduct = addonProductId ? await getProductById(addonProductId) : null;
  const addonAmount = addonProduct?.price ?? 0;

  const amount = product.price * quantity;
  const paymentFee = await getPaymentFee(paymentMethod, orderType);
  const breakdown = calculateTotal(amount + addonAmount, product.shipping_fee, paymentFee);

  const customer = await upsertCustomer(customerInput);

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customer.id,
      product_id: productId,
      type: orderType,
      payment_method: paymentMethod,
      amount,
      shipping_fee: product.shipping_fee,
      payment_fee: paymentFee,
      status: "pending",
      delivery_date: deliveryDate || null,
      delivery_time_slot: deliveryTimeSlot || null,
      agreed_terms_at: new Date().toISOString(),
      addon_product_id: addonProduct?.id ?? null,
      addon_amount: addonProduct ? addonAmount : null,
      shipping_address: shippingAddress ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (orderType === "subscription") {
    await supabase.from("subscriptions").insert({
      order_id: order.id,
      interval: subscriptionInterval,
      status: "active",
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
    await fulfillOrder(order.id);
  }

  return NextResponse.json({ orderId: order.id, accepted, breakdown });
}
