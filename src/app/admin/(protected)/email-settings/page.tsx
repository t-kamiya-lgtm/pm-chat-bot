import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailSettingsTabs } from "@/components/admin/EmailSettingsTabs";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-templates";
import type { ScenarioEmailRow } from "@/components/admin/EmailAddressesTable";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const supabase = createSupabaseAdminClient();
  const [{ data: templateData }, { data: scenarioData, error }] = await Promise.all([
    supabase.from("email_templates").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("scenarios")
      .select(
        "id, name, email_from_address, inquiry_receive_email, inquiry_auto_reply_from, order_confirmation_from, abandoned_reminder_from, cancellation_from, shipment_complete_from",
      )
      .order("display_order", { ascending: true }),
  ]);

  const scenarios: ScenarioEmailRow[] = (scenarioData ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    emailFromAddress: s.email_from_address,
    inquiryReceiveEmail: s.inquiry_receive_email,
    inquiryAutoReplyFrom: s.inquiry_auto_reply_from,
    orderConfirmationFrom: s.order_confirmation_from,
    abandonedReminderFrom: s.abandoned_reminder_from,
    cancellationFrom: s.cancellation_from,
    shipmentCompleteFrom: s.shipment_complete_from,
  }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">メール設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        自動メールの件名・本文の編集(全商品共通)と、シナリオごとの送信元アドレスの設定をまとめて行えます。
      </p>
      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          シナリオ一覧の取得に失敗しました({error.message})
        </p>
      )}
      <EmailSettingsTabs
        templatesProps={{
          initialOrderCompletionSubject:
            templateData?.order_completion_subject || DEFAULT_EMAIL_TEMPLATES.orderCompletionSubject,
          initialOrderCompletionBody:
            templateData?.order_completion_body || DEFAULT_EMAIL_TEMPLATES.orderCompletionBody,
          initialRenewalSubject: templateData?.renewal_subject || DEFAULT_EMAIL_TEMPLATES.renewalSubject,
          initialRenewalBody: templateData?.renewal_body || DEFAULT_EMAIL_TEMPLATES.renewalBody,
          initialAbandonedLeadSubject:
            templateData?.abandoned_lead_subject || DEFAULT_EMAIL_TEMPLATES.abandonedLeadSubject,
          initialAbandonedLeadBody:
            templateData?.abandoned_lead_body || DEFAULT_EMAIL_TEMPLATES.abandonedLeadBody,
          initialInquiryAutoReplySubject:
            templateData?.inquiry_auto_reply_subject || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplySubject,
          initialInquiryAutoReplyBody:
            templateData?.inquiry_auto_reply_body || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplyBody,
          initialCancellationSubject:
            templateData?.cancellation_subject || DEFAULT_EMAIL_TEMPLATES.cancellationSubject,
          initialCancellationBody: templateData?.cancellation_body || DEFAULT_EMAIL_TEMPLATES.cancellationBody,
          initialShipmentCompleteSubject:
            templateData?.shipment_complete_subject || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteSubject,
          initialShipmentCompleteBody:
            templateData?.shipment_complete_body || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteBody,
          defaults: DEFAULT_EMAIL_TEMPLATES,
        }}
        scenarios={scenarios}
      />
    </div>
  );
}
