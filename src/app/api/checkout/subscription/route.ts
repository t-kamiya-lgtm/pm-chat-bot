import { NextResponse } from "next/server";
import { z } from "zod";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  customerInputSchema,
  shippingAddressSchema,
  subscriptionIntervalSchema,
} from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { upsertCustomer, setCustomerStripeId } from "@/lib/customers";
import { calculateTotal } from "@/lib/fees";
import { generateOrderNumber } from "@/lib/order-number";
import { resolveApplicableCoupon } from "@/lib/coupons";
import { SUBSCRIPTION_INTERVAL_STRIPE_MAP } from "@/lib/subscription-intervals";

const requestSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  subscriptionInterval: subscriptionIntervalSchema,
  customer: customerInputSchema,
  deliveryDate: z.string().optional(),
  deliveryTimeSlot: z.string().optional(),
  agreedTerms: z.literal(true),
  agreedPrivacy: z.literal(true),
  addonProductId: z.string().uuid().optional(),
  shippingAddress: shippingAddressSchema.optional(),
  surveyResponses: z.record(z.string(), z.string()).optional(),
  scenarioId: z.string().uuid().optional(),
  sessionId: z.string().min(1).optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  couponCode: z.string().optional(),
  setSelections: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

const INTERVAL_MAP = SUBSCRIPTION_INTERVAL_STRIPE_MAP;

/**
 * 定期注文のカード決済(Stripe Billing)。
 * 商品ごとに周期別のPriceをその都度作成し、Subscriptionを作成する。
 * 決済確定・以後の周期課金はStripe側で自動実行され、Webhookで状態を反映する。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const {
    productId,
    quantity,
    subscriptionInterval,
    customer: customerInput,
    deliveryDate,
    deliveryTimeSlot,
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

  const product = await getProductById(productId);
  if (!product) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }
  if (
    product.order_type !== "subscription" ||
    !product.subscription_intervals.includes(subscriptionInterval)
  ) {
    return NextResponse.json(
      { error: "product does not support this subscription interval" },
      { status: 400 },
    );
  }

  const addonProduct = addonProductId ? await getProductById(addonProductId) : null;
  const addonAmount = addonProduct?.price ?? 0;
  // アドオン商品自体も定期購入対応で、メインと同じ周期に対応している場合は、単発の追加購入ではなく
  // メインと同じ周期のもう1つの定期便として同時に申し込む(お届け周期を揃えることで、
  // Stripe側は1つのSubscriptionに2つの定期Priceを乗せるだけで済み、決済確認も1回で完結する)。
  const addonIsSubscription =
    addonProduct?.order_type === "subscription" &&
    addonProduct.subscription_intervals.includes(subscriptionInterval);

  const amount = product.price * quantity;
  // 初回価格が設定されている場合、初回請求のみ値引く(定期のPrice自体は通常価格のまま据え置き、
  // 2回目以降はStripeが自動でamountをそのまま繰り返し請求する)。
  const firstTimeDiscountAmount =
    product.first_time_price !== null ? Math.max(0, amount - product.first_time_price * quantity) : 0;
  // 定期のPrice(2回目以降の請求額)には値引きを含めない(アドオンは初回請求のみの一括請求項目として追加する)
  const recurringBreakdown = calculateTotal(amount, product.shipping_fee, 0);

  const supabase = createSupabaseAdminClient();
  // クーポン割引も、定期の単価自体は変えず初回請求のみの一括値引き項目として適用する
  const appliedCoupon = await resolveApplicableCoupon(supabase, {
    scenarioId,
    code: couponCode,
    subtotal: amount + addonAmount,
  });
  // 画面表示・注文データに使う「今回のお支払い金額」は、クーポン割引・初回特別価格の
  // 値引きを反映した金額にする(実際にStripeへ請求する初回invoiceの金額と一致させる)
  const breakdown = calculateTotal(
    amount,
    product.shipping_fee,
    0,
    (appliedCoupon?.discountAmount ?? 0) + firstTimeDiscountAmount,
  );

  const customer = await upsertCustomer(customerInput);

  let stripeCustomerId = customer.stripe_customer_id;
  let subscription;
  try {
    const stripe = getStripeClient();
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name: customer.name,
        phone: customer.phone ?? undefined,
        // サンドボックスでの定期2回目以降の請求検証用。本番では未設定のため無効。
        ...(process.env.STRIPE_TEST_CLOCK_ID && { test_clock: process.env.STRIPE_TEST_CLOCK_ID }),
      });
      console.log("[checkout/subscription] created stripe customer", {
        stripeCustomerId: stripeCustomer.id,
        envTestClock: process.env.STRIPE_TEST_CLOCK_ID ?? null,
        stripeCustomerTestClock: stripeCustomer.test_clock ?? null,
      });
      stripeCustomerId = stripeCustomer.id;
      await setCustomerStripeId(customer.id, stripeCustomerId);
    }

    const { interval, intervalCount } = INTERVAL_MAP[subscriptionInterval];
    const price = await stripe.prices.create({
      currency: "jpy",
      unit_amount: recurringBreakdown.total,
      recurring: { interval, interval_count: intervalCount },
      product_data: { name: product.name },
    });

    const subscriptionItems: { price: string; quantity: number }[] = [{ price: price.id, quantity }];

    if (addonProduct && addonIsSubscription) {
      // アドオンも定期便として、メインと同じ周期のPriceをもう1つ追加する(同一Subscription内)。
      const addonPrice = await stripe.prices.create({
        currency: "jpy",
        unit_amount: addonAmount,
        recurring: { interval, interval_count: intervalCount },
        product_data: { name: addonProduct.name },
      });
      subscriptionItems.push({ price: addonPrice.id, quantity: 1 });
    } else if (addonProduct) {
      // 初回請求のみの一括請求項目として、次に作成するsubscriptionの最初のinvoiceに自動で乗る
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: addonAmount,
        currency: "jpy",
        description: `${addonProduct.name}(初回のみ)`,
      });
    }

    if (appliedCoupon && appliedCoupon.discountAmount > 0) {
      // クーポン割引も初回請求のみの一括値引き項目として乗せる(定期の単価自体は変えない)
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: -appliedCoupon.discountAmount,
        currency: "jpy",
        description: "クーポン割引(初回のみ)",
      });
    }

    if (firstTimeDiscountAmount > 0) {
      // 初回特別価格も同様に、初回請求のみの一括値引き項目として乗せる
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: -firstTimeDiscountAmount,
        currency: "jpy",
        description: "初回特別価格(初回のみ)",
      });
    }

    subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: subscriptionItems,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        productId,
        customerId: customer.id,
        subscriptionInterval,
        ...(addonProduct && { addonProductId: addonProduct.id }),
      },
    });
  } catch (err) {
    console.error("[checkout/subscription] Stripe error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "決済の準備に失敗しました" },
      { status: 500 },
    );
  }

  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
  const clientSecret = latestInvoice?.confirmation_secret?.client_secret;

  if (!clientSecret) {
    console.error("[checkout/subscription] Subscription created without a client_secret", {
      subscriptionId: subscription.id,
      invoiceId: latestInvoice?.id,
    });
    return NextResponse.json(
      { error: "決済の準備に失敗しました(client secret missing)" },
      { status: 500 },
    );
  }

  const orderNumber = await generateOrderNumber(supabase, scenarioId);
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customer.id,
      product_id: productId,
      scenario_id: scenarioId ?? null,
      order_number: orderNumber,
      session_id: sessionId ?? null,
      type: "subscription",
      payment_method: "stripe",
      amount,
      quantity,
      shipping_fee: product.shipping_fee,
      payment_fee: 0,
      status: "pending",
      stripe_subscription_id: subscription.id,
      delivery_date: deliveryDate || null,
      delivery_time_slot: deliveryTimeSlot || null,
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

  await supabase.from("subscriptions").insert({
    order_id: order.id,
    interval: subscriptionInterval,
    status: "active",
  });

  // このセッションの離脱リードが実際には注文につながったことを記録する(以後、別注文で上書きしない)。
  if (sessionId) {
    await supabase.from("leads").update({ order_status: "ordered" }).eq("session_id", sessionId);
  }

  return NextResponse.json({ orderId: order.id, clientSecret, breakdown });
}
