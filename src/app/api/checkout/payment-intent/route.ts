import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { orders, leads } from "@/db/schema";
import { customerInputSchema, shippingAddressSchema } from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { upsertCustomer, setCustomerStripeId } from "@/lib/customers";
import { calculateTotal } from "@/lib/fees";
import { generateOrderNumber } from "@/lib/order-number";
import { resolveApplicableCoupon } from "@/lib/coupons";
import { resolveOrderCostSnapshot } from "@/lib/order-cost-snapshot";

const requestSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  customer: customerInputSchema,
  deliveryDate: z.string().optional(),
  deliveryTimeSlot: z.string().optional(),
  invoiceNote: z.string().max(40).optional(),
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

/**
 * 単発注文の即時決済(カード, Apple Pay/Google Pay)。
 * Stripe PaymentIntentを作成し、フロントのPayment Elementに渡すclientSecretを返す。
 * 決済確定はWebhook(payment_intent.succeeded)で行う。
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

  const product = await getProductById(productId);
  if (!product) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }

  const addonProduct = addonProductId ? await getProductById(addonProductId) : null;
  const addonAmount = addonProduct?.price ?? 0;

  const amount = product.price * quantity;
  const db = await getDb();
  const appliedCoupon = await resolveApplicableCoupon(db, {
    scenarioId,
    code: couponCode,
    subtotal: amount + addonAmount,
    cartProductIds: [productId, addonProductId].filter((id): id is string => Boolean(id)),
  });
  const breakdown = calculateTotal(
    amount + addonAmount,
    product.shipping_fee,
    0,
    appliedCoupon?.discountAmount ?? 0,
  );

  const customer = await upsertCustomer(customerInput);

  let stripeCustomerId = customer.stripe_customer_id;
  let paymentIntent;
  try {
    const stripe = getStripeClient();
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name: customer.name,
        phone: customer.phone ?? undefined,
      });
      stripeCustomerId = stripeCustomer.id;
      await setCustomerStripeId(customer.id, stripeCustomerId);
    }

    paymentIntent = await stripe.paymentIntents.create({
      amount: breakdown.total,
      currency: "jpy",
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        productId,
        customerId: customer.id,
        quantity: String(quantity),
        ...(addonProduct && { addonProductId: addonProduct.id }),
      },
    });
  } catch (err) {
    console.error("[checkout/payment-intent] Stripe error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "決済の準備に失敗しました" },
      { status: 500 },
    );
  }

  if (!paymentIntent.client_secret) {
    console.error("[checkout/payment-intent] PaymentIntent created without client_secret", {
      paymentIntentId: paymentIntent.id,
    });
    return NextResponse.json(
      { error: "決済の準備に失敗しました(client secret missing)" },
      { status: 500 },
    );
  }

  const orderNumber = await generateOrderNumber(db, scenarioId);
  const costSnapshot = await resolveOrderCostSnapshot(db, productId, new Date().toISOString());

  let order;
  try {
    [order] = await db
      .insert(orders)
      .values({
        customerId: customer.id,
        productId: productId,
        scenarioId: scenarioId ?? null,
        orderNumber: orderNumber,
        sessionId: sessionId ?? null,
        type: "one_time",
        paymentMethod: "stripe",
        amount,
        quantity,
        shippingFee: product.shipping_fee,
        paymentFee: 0,
        costAmount: costSnapshot.cost_amount,
        bundleInsertCost: costSnapshot.bundle_insert_cost,
        shippingCost: costSnapshot.shipping_cost,
        salesCommissionAmount: costSnapshot.sales_commission_amount,
        taxRate: costSnapshot.tax_rate !== null ? String(costSnapshot.tax_rate) : null,
        status: "pending",
        stripePaymentIntentId: paymentIntent.id,
        deliveryDate: deliveryDate || null,
        deliveryTimeSlot: deliveryTimeSlot || null,
        invoiceNote: invoiceNote || null,
        agreedTermsAt: new Date().toISOString(),
        addonProductId: addonProduct?.id ?? null,
        addonAmount: addonProduct ? addonAmount : null,
        shippingAddress: shippingAddress ?? null,
        surveyResponses: surveyResponses ?? null,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        couponId: appliedCoupon?.id ?? null,
        couponCode: appliedCoupon?.code ?? null,
        discountAmount: appliedCoupon?.discountAmount ?? 0,
        setSelections: setSelections ?? null,
      })
      .returning({ id: orders.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  // クーポンの使用回数は、決済確定(Webhook)時点で加算する(与信のみで完了前の失敗・放棄では消費しない)。

  // このセッションの離脱リードが実際には注文につながったことを記録する(以後、別注文で上書きしない)。
  if (sessionId) {
    await db.update(leads).set({ orderStatus: "ordered" }).where(eq(leads.sessionId, sessionId));
  }

  return NextResponse.json({
    orderId: order.id,
    clientSecret: paymentIntent.client_secret,
    breakdown,
  });
}
