import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders, subscriptions } from "@/db/schema";
import { requireAdminRole } from "@/lib/require-role";
import { shippingAddressSchema, subscriptionIntervalSchema } from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { getPaymentFee } from "@/lib/fees";
import { getCoreSystemAdapter } from "@/lib/adapters/core-system";
import { sendOrderCompletionEmail } from "@/lib/order-completion-email";
import { assignCustomerNumberIfNeeded } from "@/lib/customer-number";
import { generateOrderNumber } from "@/lib/order-number";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import { diffFields, recordChangeLog } from "@/lib/customer-change-log";
import { resolveOrderCostSnapshot } from "@/lib/order-cost-snapshot";
import type { Address } from "@/lib/types";

const newOrderSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).default(1),
    amount: z.number().int().min(0),
    paymentMethod: z.enum(["cod", "deferred_invoice"]),
    orderKind: z.enum(["one_time", "subscription"]),
    subscriptionInterval: subscriptionIntervalSchema.optional(),
    // 次回お届けより同梱/初回は即出荷し次回より同梱/別送。単品(one_time)には
    // ship_now_then_bundle(次回という概念がない)は使わない想定。
    deliveryTiming: z.enum(["bundle_next", "ship_now_then_bundle", "separate"]),
    // 同梱の基準にする既存の定期購入(subscriptions.id)。頻度が違う場合は開始日のみ揃える。
    alignToSubscriptionId: z.string().uuid().optional(),
    deliveryDate: z.string().optional(),
    shippingAddress: shippingAddressSchema.nullable().optional(),
    invoiceNote: z.string().max(40).optional(),
  })
  .refine((v) => v.orderKind !== "subscription" || v.subscriptionInterval, {
    message: "定期注文にはお届け頻度が必要です",
    path: ["subscriptionInterval"],
  });

type RouteParams = { params: Promise<{ id: string }> };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 顧客個別画面(①注文内容)から、スタッフが手入力で新規注文を登録する。
 * 単品追加・定期プランの新規追加(既存とは異なる頻度、または完全に独立させたい場合)に使う。
 * 同一頻度で既存の定期プランに統合(同梱)したい場合はこのAPIではなく
 * /api/orders/[id]/subscription-items を使う(このAPIは常に新しい注文行/定期を作る)。
 * Stripeへの決済連携は行わない(代引き・後払いのみ選択可能)。
 */
export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: customerId } = await params;

  const body = await request.json();
  const parsed = newOrderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  const db = await getDb();
  let customer;
  try {
    [customer] = await db
      .select({ id: customers.id, name: customers.name, email: customers.email, phone: customers.phone, address: customers.address })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!customer) return NextResponse.json({ error: "customer not found" }, { status: 404 });

  const product = await getProductById(input.productId);
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });

  let alignedNextBillingDate: string | null = null;
  if (input.alignToSubscriptionId) {
    const [alignTarget] = await db
      .select({ nextBillingDate: subscriptions.nextBillingDate })
      .from(subscriptions)
      .where(eq(subscriptions.id, input.alignToSubscriptionId))
      .limit(1);
    alignedNextBillingDate = alignTarget?.nextBillingDate ?? null;
  }

  let deliveryDate: string;
  let firstCycleNextBillingDate: string | null = null;
  if (input.deliveryTiming === "bundle_next") {
    deliveryDate = alignedNextBillingDate ?? input.deliveryDate ?? todayStr();
  } else if (input.deliveryTiming === "ship_now_then_bundle") {
    deliveryDate = input.deliveryDate ?? todayStr();
    firstCycleNextBillingDate = alignedNextBillingDate;
  } else {
    deliveryDate = input.deliveryDate ?? todayStr();
  }

  const paymentFee = await getPaymentFee(input.paymentMethod, input.orderKind);
  const orderNumber = await generateOrderNumber(db, null);
  const costSnapshot = await resolveOrderCostSnapshot(db, input.productId, new Date().toISOString());

  let order;
  try {
    [order] = await db
      .insert(orders)
      .values({
        customerId: customer.id,
        productId: input.productId,
        orderNumber: orderNumber,
        type: input.orderKind,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        quantity: input.quantity,
        shippingFee: product.shipping_fee,
        paymentFee: paymentFee,
        status: "pending",
        costAmount: costSnapshot.cost_amount,
        bundleInsertCost: costSnapshot.bundle_insert_cost,
        shippingCost: costSnapshot.shipping_cost,
        salesCommissionAmount: costSnapshot.sales_commission_amount,
        taxRate: costSnapshot.tax_rate !== null ? String(costSnapshot.tax_rate) : null,
        deliveryDate: deliveryDate,
        invoiceNote: input.invoiceNote || null,
        agreedTermsAt: new Date().toISOString(),
        shippingAddress: input.shippingAddress ?? null,
      })
      .returning({ id: orders.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  let subscriptionId: string | null = null;
  if (input.orderKind === "subscription" && input.subscriptionInterval) {
    const nextBillingDate =
      firstCycleNextBillingDate ??
      (() => {
        const d = new Date(deliveryDate);
        d.setDate(d.getDate() + SUBSCRIPTION_INTERVAL_DAYS[input.subscriptionInterval!]);
        return d.toISOString().slice(0, 10);
      })();
    let subscription;
    try {
      [subscription] = await db
        .insert(subscriptions)
        .values({
          orderId: order.id,
          interval: input.subscriptionInterval,
          status: "active",
          nextBillingDate: nextBillingDate,
        })
        .returning({ id: subscriptions.id });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
    subscriptionId = subscription.id;
  }

  const coreSystem = getCoreSystemAdapter();
  const { accepted } = await coreSystem.submitOrder({
    orderId: order.id,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address as Address,
    },
    orderType: input.orderKind,
    paymentMethod: input.paymentMethod,
    product: { id: input.productId, quantity: input.quantity },
    subscriptionInterval: input.subscriptionInterval,
    amount: input.amount,
    shippingFee: product.shipping_fee,
    paymentFee,
    shippingAddress: input.shippingAddress ?? undefined,
  });

  await db.update(orders).set({ status: accepted ? "accepted" : "failed" }).where(eq(orders.id, order.id));

  if (accepted) {
    await sendOrderCompletionEmail(order.id);
    await assignCustomerNumberIfNeeded(customer.id);
  }

  await recordChangeLog(db, {
    customerId: customer.id,
    subscriptionId,
    action: "new_order_created",
    changes: diffFields([
      {
        field: "newOrder",
        label: "新規注文登録",
        before: null,
        after: `${product.name} × ${input.quantity}(¥${input.amount} / ${input.orderKind === "subscription" ? input.subscriptionInterval : "単品"} / ${input.paymentMethod}) お届け日:${deliveryDate}`,
      },
    ]),
    changedByEmail: roleCheck.user.email,
  });

  return NextResponse.json({ orderId: order.id, subscriptionId, accepted }, { status: 201 });
}
