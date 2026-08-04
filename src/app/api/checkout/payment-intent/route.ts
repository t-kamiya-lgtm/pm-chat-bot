import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { customerInputSchema } from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { upsertCustomer, setCustomerStripeId } from "@/lib/customers";
import { calculateTotal } from "@/lib/fees";

const requestSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  customer: customerInputSchema,
  deliveryDate: z.string().optional(),
  deliveryTimeSlot: z.string().optional(),
  agreedTerms: z.literal(true),
  agreedPrivacy: z.literal(true),
  addonProductId: z.string().uuid().optional(),
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
    addonProductId,
  } = parsed.data;

  const product = await getProductById(productId);
  if (!product) {
    return NextResponse.json({ error: "product not found" }, { status: 404 });
  }

  const addonProduct = addonProductId ? await getProductById(addonProductId) : null;
  const addonAmount = addonProduct?.price ?? 0;

  const amount = product.price * quantity;
  const breakdown = calculateTotal(amount + addonAmount, product.shipping_fee, 0);

  const customer = await upsertCustomer(customerInput);

  const stripe = getStripeClient();
  let stripeCustomerId = customer.stripe_customer_id;
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      email: customer.email,
      name: customer.name,
      phone: customer.phone ?? undefined,
    });
    stripeCustomerId = stripeCustomer.id;
    await setCustomerStripeId(customer.id, stripeCustomerId);
  }

  const paymentIntent = await stripe.paymentIntents.create({
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

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customer.id,
      product_id: productId,
      type: "one_time",
      payment_method: "stripe",
      amount,
      shipping_fee: product.shipping_fee,
      payment_fee: 0,
      status: "pending",
      stripe_payment_intent_id: paymentIntent.id,
      delivery_date: deliveryDate ?? null,
      delivery_time_slot: deliveryTimeSlot ?? null,
      agreed_terms_at: new Date().toISOString(),
      addon_product_id: addonProduct?.id ?? null,
      addon_amount: addonProduct ? addonAmount : null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    orderId: order.id,
    clientSecret: paymentIntent.client_secret,
    breakdown,
  });
}
