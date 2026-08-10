import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendResendEmail } from "@/lib/email";
import { getEmailTemplates, renderEmailTemplate } from "@/lib/email-templates";

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
    const supabase = createSupabaseAdminClient();

    const { data: order } = await supabase
      .from("orders")
      .update({ completion_email_sent_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("completion_email_sent_at", null)
      .select(
        "order_number, quantity, amount, shipping_fee, payment_fee, discount_amount, customer_id, product_id, billing_cycle_number",
      )
      .maybeSingle();
    if (!order) return;

    const [{ data: customer }, { data: product }] = await Promise.all([
      supabase.from("customers").select("email, name").eq("id", order.customer_id).maybeSingle(),
      supabase.from("products").select("name").eq("id", order.product_id).maybeSingle(),
    ]);
    if (!customer?.email) return;

    const templates = await getEmailTemplates(supabase);
    const total = order.amount + order.shipping_fee + order.payment_fee - order.discount_amount;
    const vars = {
      customer_name: customer.name ?? "",
      product_name: product?.name ?? "",
      order_number: order.order_number ?? "",
      quantity: String(order.quantity),
      total_amount: total.toLocaleString("ja-JP"),
      cycle_number: String(order.billing_cycle_number),
    };

    const isRenewal = order.billing_cycle_number > 1;

    await sendResendEmail({
      to: customer.email,
      from: process.env.ORDER_EMAIL_FROM ?? "chatbot@example.com",
      subject: renderEmailTemplate(isRenewal ? templates.renewalSubject : templates.orderCompletionSubject, vars),
      text: renderEmailTemplate(isRenewal ? templates.renewalBody : templates.orderCompletionBody, vars),
    });
  } catch (err) {
    console.error("[order-completion-email] failed to send", { orderId, err });
  }
}
