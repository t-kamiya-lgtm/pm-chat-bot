import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { deferredCheckoutSchema } from "@/lib/checkout-schema";
import { getProductById } from "@/lib/products";
import { upsertCustomer } from "@/lib/customers";
import { getPaymentFee, calculateTotal } from "@/lib/fees";
import { getDb } from "@/lib/db";
import { orders, subscriptions, leads } from "@/db/schema";
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
  const firstTimeDiscountAmount =
    orderType === "subscription" && product.first_time_price !== null
      ? Math.max(0, amount - product.first_time_price * quantity)
      : 0;
  const paymentFee = await getPaymentFee(paymentMethod, orderType);

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
    paymentFee,
    (appliedCoupon?.discountAmount ?? 0) + firstTimeDiscountAmount,
  );

  const customer = await upsertCustomer(customerInput);
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
        type: orderType,
        paymentMethod: paymentMethod,
        amount,
        quantity,
        shippingFee: product.shipping_fee,
        paymentFee: paymentFee,
        status: "pending",
        costAmount: costSnapshot.cost_amount,
        bundleInsertCost: costSnapshot.bundle_insert_cost,
        shippingCost: costSnapshot.shipping_cost,
        salesCommissionAmount: costSnapshot.sales_commission_amount,
        taxRate: costSnapshot.tax_rate !== null ? String(costSnapshot.tax_rate) : null,
        // import_statusはデフォルト(not_imported)のまま作成する。Stripe注文と同様、
        // スタッフが通販ゲートCSV書き出し・出荷報告CSV取込を行うことで進めていく。
        deliveryDate: deliveryDate || null,
        deliveryTimeSlot: deliveryTimeSlot || null,
        invoiceNote: invoiceNote || null,
        agreedTermsAt: new Date().toISOString(),
        addonProductId: addonProduct?.id ?? null,
        addonAmount: addonProduct ? addonAmount : null,
        isAddonSubscription: Boolean(addonProduct && addonIsSubscription),
        shippingAddress: shippingAddress ?? null,
        surveyResponses: surveyResponses ?? null,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        couponId: appliedCoupon?.id ?? null,
        couponCode: appliedCoupon?.code ?? null,
        discountAmount: appliedCoupon?.discountAmount ?? 0,
        firstTimeDiscountAmount: firstTimeDiscountAmount || null,
        setSelections: setSelections ?? null,
      })
      .returning({ id: orders.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (orderType === "subscription" && subscriptionInterval) {
    const nextBillingDate = new Date();
    nextBillingDate.setDate(nextBillingDate.getDate() + SUBSCRIPTION_INTERVAL_DAYS[subscriptionInterval]);
    await db.insert(subscriptions).values({
      orderId: order.id,
      interval: subscriptionInterval,
      status: "active",
      nextBillingDate: nextBillingDate.toISOString().slice(0, 10),
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

  await db
    .update(orders)
    .set({ status: accepted ? "accepted" : "failed" })
    .where(eq(orders.id, order.id));

  if (accepted) {
    await sendOrderCompletionEmail(order.id);
    await assignCustomerNumberIfNeeded(customer.id);
    if (appliedCoupon) {
      await recordCouponUsage(db, appliedCoupon.id);
    }
  }

  // このセッションの離脱リードが実際には注文につながったことを記録する(以後、別注文で上書きしない)。
  if (sessionId) {
    await db.update(leads).set({ orderStatus: "ordered" }).where(eq(leads.sessionId, sessionId));
  }

  return NextResponse.json({ orderId: order.id, accepted, breakdown });
}
