import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface EmailTemplates {
  orderCompletionSubject: string;
  orderCompletionBody: string;
  renewalSubject: string;
  renewalBody: string;
  abandonedLeadSubject: string;
  abandonedLeadBody: string;
}

/** DBの行が空(未設定)の場合に使う初期テンプレート。 */
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  orderCompletionSubject: "【ご注文ありがとうございます】{{product_name}}(注文番号: {{order_number}})",
  orderCompletionBody: `{{customer_name}} 様

ご注文ありがとうございます。以下の内容で承りました。

■ご注文番号: {{order_number}}
■商品: {{product_name}}
■数量: {{quantity}}
■お支払い金額: {{total_amount}}円

発送準備が整いましたら、改めてご連絡いたします。
今後ともよろしくお願いいたします。`,
  renewalSubject: "【定期便】{{product_name}}をお届けします(第{{cycle_number}}回)",
  renewalBody: `{{customer_name}} 様

いつもご利用ありがとうございます。定期便(第{{cycle_number}}回)のお支払いが完了し、発送準備を進めております。

■商品: {{product_name}}
■数量: {{quantity}}
■お支払い金額: {{total_amount}}円

今後ともよろしくお願いいたします。`,
  abandonedLeadSubject: "{{customer_name}}様、ご注文の途中ではありませんか?",
  abandonedLeadBody: `{{customer_name}} 様

先ほどご検討いただいた「{{product_name}}」のご注文がまだ完了していないようです。
下記のリンクから、チャットに戻ってご注文を続けることができます。

{{chat_url}}

ご不明な点がございましたら、チャットからお気軽にお問い合わせください。

---
本メールの配信停止をご希望の場合は、以下のリンクからお手続きください。
{{unsubscribe_url}}`,
};

/** "{{key}}" 形式のプレースホルダーを対応する値に置き換える。 */
export function renderEmailTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

/** 管理画面で編集された件名・本文テンプレートを取得する(未設定項目はデフォルト文言を返す)。 */
export async function getEmailTemplates(
  supabase = createSupabaseAdminClient(),
): Promise<EmailTemplates> {
  const { data } = await supabase.from("email_templates").select("*").eq("id", 1).maybeSingle();
  return {
    orderCompletionSubject: data?.order_completion_subject || DEFAULT_EMAIL_TEMPLATES.orderCompletionSubject,
    orderCompletionBody: data?.order_completion_body || DEFAULT_EMAIL_TEMPLATES.orderCompletionBody,
    renewalSubject: data?.renewal_subject || DEFAULT_EMAIL_TEMPLATES.renewalSubject,
    renewalBody: data?.renewal_body || DEFAULT_EMAIL_TEMPLATES.renewalBody,
    abandonedLeadSubject: data?.abandoned_lead_subject || DEFAULT_EMAIL_TEMPLATES.abandonedLeadSubject,
    abandonedLeadBody: data?.abandoned_lead_body || DEFAULT_EMAIL_TEMPLATES.abandonedLeadBody,
  };
}
