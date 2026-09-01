import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders, products, scenarios } from "@/db/schema";
import { sendResendEmail } from "@/lib/email";
import { getEmailTemplates, renderEmailTemplate } from "@/lib/email-templates";
import { resolveScenarioFrom } from "@/lib/scenario-email";

/**
 * 受注ステータスを「キャンセル」にした際に購入者へ送るメール。
 * cancellation_email_sent_atを「未設定の場合のみ更新」する形で一度だけ送信する。
 * メール送信の失敗が受注ステータス更新処理そのものを失敗させないよう、例外は投げずログのみ出力する。
 */
export async function sendCancellationEmail(orderId: string): Promise<void> {
  try {
    const db = await getDb();

    const [order] = await db
      .update(orders)
      .set({ cancellationEmailSentAt: new Date().toISOString() })
      .where(and(eq(orders.id, orderId), isNull(orders.cancellationEmailSentAt)))
      .returning({
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        productId: orders.productId,
        scenarioId: orders.scenarioId,
      });
    if (!order) return;

    const [[customer], [product], [scenario]] = await Promise.all([
      db.select({ email: customers.email, name: customers.name }).from(customers).where(eq(customers.id, order.customerId)).limit(1),
      db.select({ name: products.name }).from(products).where(eq(products.id, order.productId)).limit(1),
      order.scenarioId
        ? db
            .select({ emailFromAddress: scenarios.emailFromAddress, cancellationFrom: scenarios.cancellationFrom })
            .from(scenarios)
            .where(eq(scenarios.id, order.scenarioId))
            .limit(1)
        : Promise.resolve([null]),
    ]);
    if (!customer?.email) return;

    const templates = await getEmailTemplates();
    const vars = {
      customer_name: customer.name ?? "",
      product_name: product?.name ?? "",
      order_number: order.orderNumber ?? "",
    };

    await sendResendEmail({
      to: customer.email,
      from: resolveScenarioFrom(
        scenario ? { email_from_address: scenario.emailFromAddress, cancellation_from: scenario.cancellationFrom } : null,
        "cancellation_from",
      ),
      subject: renderEmailTemplate(templates.cancellationSubject, vars),
      text: renderEmailTemplate(templates.cancellationBody, vars),
    });
  } catch (err) {
    console.error("[order-status-emails] failed to send cancellation email", { orderId, err });
  }
}

/**
 * 送り状データCSV取込みで受注ステータスが「出荷済」になった際、購入者へ送るメール(Stripe注文のみ)。
 * shipment_email_sent_atを「未設定の場合のみ更新」する形で一度だけ送信する。
 */
export async function sendShipmentCompleteEmail(orderId: string): Promise<void> {
  try {
    const db = await getDb();

    const [order] = await db
      .update(orders)
      .set({ shipmentEmailSentAt: new Date().toISOString() })
      .where(and(eq(orders.id, orderId), isNull(orders.shipmentEmailSentAt)))
      .returning({
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        productId: orders.productId,
        scenarioId: orders.scenarioId,
        shippedAt: orders.shippedAt,
        carrierName: orders.carrierName,
        trackingNumber: orders.trackingNumber,
        deliveryDate: orders.deliveryDate,
        deliveryTimeSlot: orders.deliveryTimeSlot,
      });
    if (!order) return;

    const [[customer], [product], [scenario]] = await Promise.all([
      db.select({ email: customers.email, name: customers.name }).from(customers).where(eq(customers.id, order.customerId)).limit(1),
      db.select({ name: products.name }).from(products).where(eq(products.id, order.productId)).limit(1),
      order.scenarioId
        ? db
            .select({ emailFromAddress: scenarios.emailFromAddress, shipmentCompleteFrom: scenarios.shipmentCompleteFrom })
            .from(scenarios)
            .where(eq(scenarios.id, order.scenarioId))
            .limit(1)
        : Promise.resolve([null]),
    ]);
    if (!customer?.email) return;

    const templates = await getEmailTemplates();
    // お届け希望日時は、配送方法が宅急便(宅配便)の場合のみ案内する
    // (メール便=郵メールはポスト投函のため日時指定を受け付けていない)。
    const deliveryDateTimeLine =
      order.carrierName === "宅急便" && order.deliveryDate
        ? `\n■お届け希望日時: ${new Date(order.deliveryDate).toLocaleDateString("ja-JP")} ${order.deliveryTimeSlot ?? ""}`.trimEnd()
        : "";
    const vars = {
      customer_name: customer.name ?? "",
      product_name: product?.name ?? "",
      order_number: order.orderNumber ?? "",
      ship_date: order.shippedAt ? new Date(order.shippedAt).toLocaleDateString("ja-JP") : "",
      carrier_name: order.carrierName ?? "",
      tracking_number: order.trackingNumber ?? "",
      delivery_datetime_line: deliveryDateTimeLine,
    };

    await sendResendEmail({
      to: customer.email,
      from: resolveScenarioFrom(
        scenario
          ? { email_from_address: scenario.emailFromAddress, shipment_complete_from: scenario.shipmentCompleteFrom }
          : null,
        "shipment_complete_from",
      ),
      subject: renderEmailTemplate(templates.shipmentCompleteSubject, vars),
      text: renderEmailTemplate(templates.shipmentCompleteBody, vars),
    });
  } catch (err) {
    console.error("[order-status-emails] failed to send shipment complete email", { orderId, err });
  }
}
