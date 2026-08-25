import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    const supabase = createSupabaseAdminClient();

    const { data: order } = await supabase
      .from("orders")
      .update({ cancellation_email_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("cancellation_email_sent_at", null)
      .select("order_number, customer_id, product_id, scenario_id")
      .maybeSingle();
    if (!order) return;

    const [{ data: customer }, { data: product }, { data: scenario }] = await Promise.all([
      supabase.from("customers").select("email, name").eq("id", order.customer_id).maybeSingle(),
      supabase.from("products").select("name").eq("id", order.product_id).maybeSingle(),
      order.scenario_id
        ? supabase
            .from("scenarios")
            .select("email_from_address, cancellation_from")
            .eq("id", order.scenario_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!customer?.email) return;

    const templates = await getEmailTemplates(supabase);
    const vars = {
      customer_name: customer.name ?? "",
      product_name: product?.name ?? "",
      order_number: order.order_number ?? "",
    };

    await sendResendEmail({
      to: customer.email,
      from: resolveScenarioFrom(scenario, "cancellation_from"),
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
    const supabase = createSupabaseAdminClient();

    const { data: order } = await supabase
      .from("orders")
      .update({ shipment_email_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("shipment_email_sent_at", null)
      .select(
        "order_number, customer_id, product_id, scenario_id, shipped_at, carrier_name, tracking_number, delivery_date, delivery_time_slot",
      )
      .maybeSingle();
    if (!order) return;

    const [{ data: customer }, { data: product }, { data: scenario }] = await Promise.all([
      supabase.from("customers").select("email, name").eq("id", order.customer_id).maybeSingle(),
      supabase.from("products").select("name").eq("id", order.product_id).maybeSingle(),
      order.scenario_id
        ? supabase
            .from("scenarios")
            .select("email_from_address, shipment_complete_from")
            .eq("id", order.scenario_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (!customer?.email) return;

    const templates = await getEmailTemplates(supabase);
    // お届け希望日時は、配送方法が宅急便(宅配便)の場合のみ案内する
    // (メール便=郵メールはポスト投函のため日時指定を受け付けていない)。
    const deliveryDateTimeLine =
      order.carrier_name === "宅急便" && order.delivery_date
        ? `\n■お届け希望日時: ${new Date(order.delivery_date).toLocaleDateString("ja-JP")} ${order.delivery_time_slot ?? ""}`.trimEnd()
        : "";
    const vars = {
      customer_name: customer.name ?? "",
      product_name: product?.name ?? "",
      order_number: order.order_number ?? "",
      ship_date: order.shipped_at ? new Date(order.shipped_at).toLocaleDateString("ja-JP") : "",
      carrier_name: order.carrier_name ?? "",
      tracking_number: order.tracking_number ?? "",
      delivery_datetime_line: deliveryDateTimeLine,
    };

    await sendResendEmail({
      to: customer.email,
      from: resolveScenarioFrom(scenario, "shipment_complete_from"),
      subject: renderEmailTemplate(templates.shipmentCompleteSubject, vars),
      text: renderEmailTemplate(templates.shipmentCompleteBody, vars),
    });
  } catch (err) {
    console.error("[order-status-emails] failed to send shipment complete email", { orderId, err });
  }
}
