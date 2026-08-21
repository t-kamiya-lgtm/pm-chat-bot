/**
 * 商品QAの「その他のご質問」問い合わせフォーム(要件定義書 4.7)用の通知メール送信。
 * DBには永続化せず、担当者メールアドレスへ通知するのみ。
 * RESEND_API_KEY が未設定の場合はコンソールログに出力するだけのフォールバックとする。
 */
export interface InquiryInput {
  name: string;
  email: string;
  message: string;
  productName?: string;
  chatUrl?: string;
  /** 受領アドレス。シナリオごとの設定があればそちらを優先し、未設定時は共通の環境変数を使う。 */
  receiveEmail?: string;
}

export async function sendInquiryNotification(input: InquiryInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = input.receiveEmail || process.env.INQUIRY_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    console.log("[inquiry] notification email not configured, logging instead:", input);
    return;
  }

  // 運用テスト期間中、本番の問い合わせと見分けられるよう件名に明記する。
  const testPrefix = process.env.INQUIRY_TEST_MODE === "true" ? "【テスト】" : "";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.INQUIRY_FROM_EMAIL ?? "chatbot@example.com",
      to,
      subject: `${testPrefix}[チャットボット問い合わせ] ${input.productName ?? "商品QA"}`,
      text: `お名前: ${input.name}\nメールアドレス: ${input.email}\n商品: ${
        input.productName ?? "-"
      }\n\n${input.message}${
        input.chatUrl
          ? `\n\nチャットURL: ${input.chatUrl}\n(お客様への返信時にこちらのリンクをご案内し、チャットボットでのご購入をお促しください)`
          : ""
      }`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send inquiry notification: ${res.status}`);
  }
}

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * GAS(Google Apps Script) Webhook経由のメール送信ヘルパー(注文完了メール・離脱者リマインドメール用)。
 * GAS_MAIL_WEBHOOK_URL / GAS_MAIL_SECRET が未設定の場合はコンソールログに出力するだけのフォールバックとする。
 * 送信元アドレスはGAS側(Google Workspaceの送信元)で固定のため、input.fromは現時点では使用しない
 * (呼び出し元のシナリオ別送信元設定との整合は別途検討が必要)。
 * 戻り値は「実際にGAS Webhook経由で送信を試みたか」を示す(false = ログ出力のみ)。
 */
export async function sendResendEmail(input: SendEmailInput): Promise<boolean> {
  const webhookUrl = process.env.GAS_MAIL_WEBHOOK_URL;
  const secret = process.env.GAS_MAIL_SECRET;
  if (!webhookUrl || !secret) {
    console.log("[email] GAS_MAIL_WEBHOOK_URL/GAS_MAIL_SECRET not configured, logging instead:", input);
    return false;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      senderName: "プライムダイレクト",
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send email via GAS webhook: ${res.status}`);
  }
  return true;
}
