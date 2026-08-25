import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailTemplatesForm } from "@/components/admin/EmailTemplatesForm";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("email_templates").select("*").eq("id", 1).maybeSingle();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">自動メール設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        注文完了メール・離脱者リマインドメールの件名・本文を編集できます(全商品共通)。
      </p>
      <EmailTemplatesForm
        initialOrderCompletionSubject={
          data?.order_completion_subject || DEFAULT_EMAIL_TEMPLATES.orderCompletionSubject
        }
        initialOrderCompletionBody={data?.order_completion_body || DEFAULT_EMAIL_TEMPLATES.orderCompletionBody}
        initialRenewalSubject={data?.renewal_subject || DEFAULT_EMAIL_TEMPLATES.renewalSubject}
        initialRenewalBody={data?.renewal_body || DEFAULT_EMAIL_TEMPLATES.renewalBody}
        initialAbandonedLeadSubject={
          data?.abandoned_lead_subject || DEFAULT_EMAIL_TEMPLATES.abandonedLeadSubject
        }
        initialAbandonedLeadBody={data?.abandoned_lead_body || DEFAULT_EMAIL_TEMPLATES.abandonedLeadBody}
        initialInquiryAutoReplySubject={
          data?.inquiry_auto_reply_subject || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplySubject
        }
        initialInquiryAutoReplyBody={
          data?.inquiry_auto_reply_body || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplyBody
        }
        initialCancellationSubject={data?.cancellation_subject || DEFAULT_EMAIL_TEMPLATES.cancellationSubject}
        initialCancellationBody={data?.cancellation_body || DEFAULT_EMAIL_TEMPLATES.cancellationBody}
        initialShipmentCompleteSubject={
          data?.shipment_complete_subject || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteSubject
        }
        initialShipmentCompleteBody={
          data?.shipment_complete_body || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteBody
        }
        defaults={DEFAULT_EMAIL_TEMPLATES}
      />
    </div>
  );
}
