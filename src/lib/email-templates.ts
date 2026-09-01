import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailTemplates } from "@/db/schema";

export interface EmailTemplates {
  orderCompletionSubject: string;
  orderCompletionBody: string;
  renewalSubject: string;
  renewalBody: string;
  abandonedLeadSubject: string;
  abandonedLeadBody: string;
  inquiryAutoReplySubject: string;
  inquiryAutoReplyBody: string;
  cancellationSubject: string;
  cancellationBody: string;
  shipmentCompleteSubject: string;
  shipmentCompleteBody: string;
}

/** DBの行が空(未設定)の場合に使う初期テンプレート。 */
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  orderCompletionSubject: "【ご注文ありがとうございます】{{product_name}}(注文番号: {{order_number}})",
  orderCompletionBody: `{{customer_name}} 様

ご注文ありがとうございます。以下の内容で承りました。

■ご注文番号: {{order_number}}
■商品: {{product_name}}
■数量: {{quantity}}
■お支払い金額: {{total_amount}}円{{addon_line}}{{subscription_info_block}}

発送準備が整いましたら、改めてご連絡いたします。
今後ともよろしくお願いいたします。`,
  renewalSubject: "【定期便】{{product_name}}をお届けします(第{{cycle_number}}回)",
  renewalBody: `{{customer_name}} 様

いつもご利用ありがとうございます。定期便(第{{cycle_number}}回)のお支払いが完了し、発送準備を進めております。

■商品: {{product_name}}
■数量: {{quantity}}
■お支払い金額: {{total_amount}}円{{addon_line}}

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
  inquiryAutoReplySubject: "【自動返信】お問い合わせを受け付けました",
  inquiryAutoReplyBody: `{{customer_name}} 様

この度はお問い合わせいただき、誠にありがとうございます。
以下の内容で承りました。担当者より改めてご連絡いたしますので、今しばらくお待ちください。

■お問い合わせ内容
{{message}}

本お問い合わせは以下のページから送信されました: {{chat_url}}

※本メールは自動返信です。このメールへの返信はできません。`,
  cancellationSubject: "【ご注文キャンセルのご連絡】{{product_name}}(注文番号: {{order_number}})",
  cancellationBody: `{{customer_name}} 様

ご注文（注文番号: {{order_number}}）は、キャンセルとなりましたのでご連絡いたします。

■商品: {{product_name}}

ご不明な点がございましたら、チャットからお気軽にお問い合わせください。`,
  shipmentCompleteSubject: "【発送のお知らせ】{{product_name}}(注文番号: {{order_number}})",
  shipmentCompleteBody: `{{customer_name}} 様

ご注文の商品を発送いたしましたのでお知らせいたします。

■ご注文番号: {{order_number}}
■商品: {{product_name}}
■出荷日: {{ship_date}}
■配送業者: {{carrier_name}}
■お問い合わせ番号: {{tracking_number}}{{delivery_datetime_line}}

商品到着まで今しばらくお待ちください。`,
};

/** "{{key}}" 形式のプレースホルダーを対応する値に置き換える。 */
export function renderEmailTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

/** 管理画面で編集された件名・本文テンプレートを取得する(未設定項目はデフォルト文言を返す)。 */
export async function getEmailTemplates(): Promise<EmailTemplates> {
  const db = await getDb();
  const [data] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, 1)).limit(1);
  return {
    orderCompletionSubject: data?.orderCompletionSubject || DEFAULT_EMAIL_TEMPLATES.orderCompletionSubject,
    orderCompletionBody: data?.orderCompletionBody || DEFAULT_EMAIL_TEMPLATES.orderCompletionBody,
    renewalSubject: data?.renewalSubject || DEFAULT_EMAIL_TEMPLATES.renewalSubject,
    renewalBody: data?.renewalBody || DEFAULT_EMAIL_TEMPLATES.renewalBody,
    abandonedLeadSubject: data?.abandonedLeadSubject || DEFAULT_EMAIL_TEMPLATES.abandonedLeadSubject,
    abandonedLeadBody: data?.abandonedLeadBody || DEFAULT_EMAIL_TEMPLATES.abandonedLeadBody,
    inquiryAutoReplySubject: data?.inquiryAutoReplySubject || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplySubject,
    inquiryAutoReplyBody: data?.inquiryAutoReplyBody || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplyBody,
    cancellationSubject: data?.cancellationSubject || DEFAULT_EMAIL_TEMPLATES.cancellationSubject,
    cancellationBody: data?.cancellationBody || DEFAULT_EMAIL_TEMPLATES.cancellationBody,
    shipmentCompleteSubject: data?.shipmentCompleteSubject || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteSubject,
    shipmentCompleteBody: data?.shipmentCompleteBody || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteBody,
  };
}
