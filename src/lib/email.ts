/**
 * 商品QAの「その他のご質問」問い合わせフォーム(要件定義書 4.7)用の通知メール送信。
 * DBには永続化せず、担当者メールアドレスへ通知するのみ。
 * GAS_MAIL_WEBHOOK_URL / GAS_MAIL_SECRET が未設定の場合はコンソールログに出力するだけのフォールバックとする。
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
  const webhookUrl = process.env.GAS_MAIL_WEBHOOK_URL;
  const secret = process.env.GAS_MAIL_SECRET;
  const to = input.receiveEmail || process.env.INQUIRY_NOTIFICATION_EMAIL;

  if (!webhookUrl || !secret || !to) {
    console.log("[inquiry] notification email not configured, logging instead:", input);
    return;
  }

  // 運用テスト期間中、本番の問い合わせと見分けられるよう件名に明記する。
  const testPrefix = process.env.INQUIRY_TEST_MODE === "true" ? "【テスト】" : "";

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret,
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
      senderName: "プライムダイレクト",
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send inquiry notification: ${res.status}`);
  }
}

export interface SmaregiSyncFailureAlertInput {
  orderId: string;
  orderNumber: string | null;
  errorMessage: string;
}

/**
 * 代引き・後払い注文のスマレジEC連携に失敗した際、運用担当へ即時通知する。
 * 管理画面上は取込みエラー(ピンク表示)になるが、気づかず出荷対応が漏れることを防ぐための能動的アラート。
 * SMAREGI_SYNC_ALERT_EMAIL未設定時は問い合わせ通知と同じ宛先(INQUIRY_NOTIFICATION_EMAIL)にフォールバックする。
 */
export async function sendSmaregiSyncFailureAlert(input: SmaregiSyncFailureAlertInput): Promise<void> {
  const webhookUrl = process.env.GAS_MAIL_WEBHOOK_URL;
  const secret = process.env.GAS_MAIL_SECRET;
  const to = process.env.SMAREGI_SYNC_ALERT_EMAIL || process.env.INQUIRY_NOTIFICATION_EMAIL;

  if (!webhookUrl || !secret || !to) {
    console.error("[smaregi-sync-alert] notification email not configured, logging instead:", input);
    return;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret,
      from: process.env.INQUIRY_FROM_EMAIL ?? "chatbot@example.com",
      to,
      subject: `【要対応】スマレジ連携エラー(注文番号: ${input.orderNumber ?? input.orderId})`,
      text: `代引き・後払い注文のスマレジEC連携に失敗しました。管理画面(受注管理)で内容を確認し、必要に応じてスマレジ側へ手動で受注登録してください。\n\n注文番号: ${
        input.orderNumber ?? "-"
      }\n注文ID: ${input.orderId}\n\nエラー内容:\n${input.errorMessage}`,
      senderName: "プライムダイレクト",
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to send smaregi sync failure alert: ${res.status}`);
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
      from: input.from,
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
