import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders, products, scenarios, subscriptions } from "@/db/schema";
import { sendResendEmail } from "@/lib/email";
import { getEmailTemplates, renderEmailTemplate } from "@/lib/email-templates";
import { resolveScenarioFrom } from "@/lib/scenario-email";
import { SUBSCRIPTION_INTERVAL_LABELS } from "@/lib/subscription-intervals";
import type { SubscriptionInterval } from "@/lib/types";

/**
 * 注文確定(初回はfulfillOrder呼び出しと同じタイミング、定期便2回目以降は注文データ生成時)で
 * 購入者へメールを送る。1回目は注文完了メール、2回目以降(billing_cycle_number > 1)は
 * 定期便専用メールを送る。
 * Webhookの再送等でこの関数自体が複数回呼ばれても、completion_email_sent_atを
 * 「未設定の場合のみ更新」する形で一度だけ送信する。
 * メール送信の失敗が注文確定処理そのものを失敗させないよう、例外は投げずログのみ出力する。
 */
export async function sendOrderCompletionEmail(orderId: string): Promise<void> {
  try {
    const db = await getDb();

    const [order] = await db
      .update(orders)
      .set({ completionEmailSentAt: new Date().toISOString() })
      .where(and(eq(orders.id, orderId), isNull(orders.completionEmailSentAt)))
      .returning({
        orderNumber: orders.orderNumber,
        type: orders.type,
        quantity: orders.quantity,
        amount: orders.amount,
        addonProductId: orders.addonProductId,
        addonAmount: orders.addonAmount,
        shippingFee: orders.shippingFee,
        paymentFee: orders.paymentFee,
        discountAmount: orders.discountAmount,
        firstTimeDiscountAmount: orders.firstTimeDiscountAmount,
        customerId: orders.customerId,
        productId: orders.productId,
        billingCycleNumber: orders.billingCycleNumber,
        scenarioId: orders.scenarioId,
        deliveryDate: orders.deliveryDate,
      });
    if (!order) return;

    const isSubscription = order.type === "subscription";
    const isRenewal = order.billingCycleNumber > 1;

    const [[customer], [product], [addonProduct], [scenario], [subscription]] = await Promise.all([
      db.select({ email: customers.email, name: customers.name }).from(customers).where(eq(customers.id, order.customerId)).limit(1),
      db.select({ name: products.name }).from(products).where(eq(products.id, order.productId)).limit(1),
      order.addonProductId
        ? db.select({ name: products.name }).from(products).where(eq(products.id, order.addonProductId)).limit(1)
        : Promise.resolve([null]),
      order.scenarioId
        ? db
            .select({ emailFromAddress: scenarios.emailFromAddress, orderConfirmationFrom: scenarios.orderConfirmationFrom })
            .from(scenarios)
            .where(eq(scenarios.id, order.scenarioId))
            .limit(1)
        : Promise.resolve([null]),
      isSubscription && !isRenewal
        ? db.select({ interval: subscriptions.interval }).from(subscriptions).where(eq(subscriptions.orderId, orderId)).limit(1)
        : Promise.resolve([null]),
    ]);
    if (!customer?.email) return;

    const templates = await getEmailTemplates();
    const total =
      order.amount +
      (order.addonAmount ?? 0) +
      order.shippingFee +
      order.paymentFee -
      order.discountAmount -
      (order.firstTimeDiscountAmount ?? 0);

    // アドオン商品は本体と別行で明示する(本体の商品名・数量に混ぜて分からなくならないようにするため)。
    const addonLine = addonProduct
      ? `\n■アドオン商品: ${addonProduct.name} x1(${(order.addonAmount ?? 0).toLocaleString("ja-JP")}円)`
      : "";

    // 定期便の初回注文のみ、初回お届け日・お届け頻度を案内する(2回目以降は「第N回」の件名・本文で分かるため対象外)。
    const subscriptionInfoBlock =
      isSubscription && !isRenewal && subscription
        ? `\n■初回お届け日: ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("ja-JP") : "追ってご連絡いたします"}\n■お届け頻度: ${SUBSCRIPTION_INTERVAL_LABELS[subscription.interval as SubscriptionInterval] ?? subscription.interval}`
        : "";

    const vars = {
      customer_name: customer.name ?? "",
      product_name: product?.name ?? "",
      order_number: order.orderNumber ?? "",
      quantity: String(order.quantity),
      total_amount: total.toLocaleString("ja-JP"),
      cycle_number: String(order.billingCycleNumber),
      addon_line: addonLine,
      subscription_info_block: subscriptionInfoBlock,
    };

    await sendResendEmail({
      to: customer.email,
      from: resolveScenarioFrom(
        scenario
          ? { email_from_address: scenario.emailFromAddress, order_confirmation_from: scenario.orderConfirmationFrom }
          : null,
        "order_confirmation_from",
      ),
      subject: renderEmailTemplate(isRenewal ? templates.renewalSubject : templates.orderCompletionSubject, vars),
      text: renderEmailTemplate(isRenewal ? templates.renewalBody : templates.orderCompletionBody, vars),
    });
  } catch (err) {
    console.error("[order-completion-email] failed to send", { orderId, err });
  }
}
