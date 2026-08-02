import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { customerInputSchema, subscriptionIntervalSchema } from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { upsertCustomer, setCustomerStripeId } from "@/lib/customers";
import { calculateTotal } from "@/lib/fees";

const requestSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  subscriptionInterval: subscriptionIntervalSchema,
  customer: customerInputSchema,
});

const INTERVAL_MAP: Record<
  z.infer<typeof subscriptionIntervalSchema>,
  { interval: Stripe.PriceCreateParams.Recurring.Interval; intervalCount: number }
> = {
  biweekly: { interval: "week", intervalCount: 2 },
  monthly: { interval: "month", intervalCount: 1 },
  bimonthly: { interval: "month", intervalCount: 2 },
};

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
  const { productId, quantity, subscriptionInterval, customer: customerInput } = parsed.data;

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

  const amount = product.price * quantity;
  const breakdown = calculateTotal(amount, product.shipping_fee, 0);

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

  const { interval, intervalCount } = INTERVAL_MAP[subscriptionInterval];
  const price = await stripe.prices.create({
    currency: "jpy",
    unit_amount: breakdown.total,
    recurring: { interval, interval_count: intervalCount },
    product_data: { name: product.name },
  });

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: price.id, quantity }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice"],
    metadata: { productId, customerId: customer.id, subscriptionInterval },
  });

  const supabase = createSupabaseAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      customer_id: customer.id,
      product_id: productId,
      type: "subscription",
      payment_method: "stripe",
      amount,
      shipping_fee: product.shipping_fee,
      payment_fee: 0,
      status: "pending",
      stripe_subscription_id: subscription.id,
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

  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
  const clientSecret = latestInvoice?.confirmation_secret?.client_secret;

  return NextResponse.json({ orderId: order.id, clientSecret, breakdown });
}
