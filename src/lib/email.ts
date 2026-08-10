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
}

export async function sendInquiryNotification(input: InquiryInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.INQUIRY_NOTIFICATION_EMAIL;

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
}

/**
 * 汎用のResend送信ヘルパー(注文完了メール・離脱者リマインドメール用)。
 * RESEND_API_KEY未設定時はコンソールログに出力するだけのフォールバックとする。
 */
export async function sendResendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[email] RESEND_API_KEY not configured, logging instead:", input);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send email: ${res.status}`);
  }
}
