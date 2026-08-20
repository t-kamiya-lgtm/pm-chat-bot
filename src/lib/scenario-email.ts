/** シナリオのメール種別ごとの送信元・受領アドレス設定(scenariosテーブルの一部列)。 */
export interface ScenarioEmailFields {
  email_from_address?: string | null;
  inquiry_receive_email?: string | null;
  inquiry_auto_reply_from?: string | null;
  order_confirmation_from?: string | null;
  abandoned_reminder_from?: string | null;
  cancellation_from?: string | null;
  shipment_complete_from?: string | null;
}

/**
 * メール種別ごとの送信元アドレスを解決する。
 * 個別設定 → シナリオ共通デフォルト(email_from_address) → 環境変数 → 固定値、の順にフォールバックする。
 */
export function resolveScenarioFrom(
  scenario: ScenarioEmailFields | null | undefined,
  field: Exclude<keyof ScenarioEmailFields, "email_from_address">,
): string {
  return (
    scenario?.[field] ||
    scenario?.email_from_address ||
    process.env.ORDER_EMAIL_FROM ||
    "chatbot@example.com"
  );
}

/** 問い合わせメールの受領アドレス(社内通知の宛先)を解決する。未設定時は共通の環境変数を使う。 */
export function resolveInquiryReceiveEmail(
  scenario: Pick<ScenarioEmailFields, "inquiry_receive_email"> | null | undefined,
): string | undefined {
  return scenario?.inquiry_receive_email || process.env.INQUIRY_NOTIFICATION_EMAIL || undefined;
}
