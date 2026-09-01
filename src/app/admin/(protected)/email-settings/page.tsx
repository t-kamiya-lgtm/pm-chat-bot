import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailTemplates, scenarios } from "@/db/schema";
import { EmailSettingsTabs } from "@/components/admin/EmailSettingsTabs";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-templates";
import type { ScenarioEmailRow } from "@/components/admin/EmailAddressesTable";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  let templateData: typeof emailTemplates.$inferSelect | undefined;
  let scenarioRows: ScenarioEmailRow[] = [];
  let loadError: string | null = null;

  try {
    const db = await getDb();
    const [templateResult, scenarioResult] = await Promise.all([
      db.select().from(emailTemplates).where(eq(emailTemplates.id, 1)).limit(1),
      db
        .select({
          id: scenarios.id,
          name: scenarios.name,
          emailFromAddress: scenarios.emailFromAddress,
          inquiryReceiveEmail: scenarios.inquiryReceiveEmail,
          inquiryAutoReplyFrom: scenarios.inquiryAutoReplyFrom,
          orderConfirmationFrom: scenarios.orderConfirmationFrom,
          abandonedReminderFrom: scenarios.abandonedReminderFrom,
          cancellationFrom: scenarios.cancellationFrom,
          shipmentCompleteFrom: scenarios.shipmentCompleteFrom,
        })
        .from(scenarios)
        .orderBy(asc(scenarios.displayOrder)),
    ]);
    [templateData] = templateResult;
    scenarioRows = scenarioResult;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error("[admin/email-settings] failed to load email settings", err);
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">メール設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        自動メールの件名・本文の編集(全商品共通)と、シナリオごとの送信元アドレスの設定をまとめて行えます。
      </p>
      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          シナリオ一覧の取得に失敗しました({loadError})
        </p>
      )}
      <EmailSettingsTabs
        templatesProps={{
          initialOrderCompletionSubject:
            templateData?.orderCompletionSubject || DEFAULT_EMAIL_TEMPLATES.orderCompletionSubject,
          initialOrderCompletionBody:
            templateData?.orderCompletionBody || DEFAULT_EMAIL_TEMPLATES.orderCompletionBody,
          initialRenewalSubject: templateData?.renewalSubject || DEFAULT_EMAIL_TEMPLATES.renewalSubject,
          initialRenewalBody: templateData?.renewalBody || DEFAULT_EMAIL_TEMPLATES.renewalBody,
          initialAbandonedLeadSubject:
            templateData?.abandonedLeadSubject || DEFAULT_EMAIL_TEMPLATES.abandonedLeadSubject,
          initialAbandonedLeadBody:
            templateData?.abandonedLeadBody || DEFAULT_EMAIL_TEMPLATES.abandonedLeadBody,
          initialInquiryAutoReplySubject:
            templateData?.inquiryAutoReplySubject || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplySubject,
          initialInquiryAutoReplyBody:
            templateData?.inquiryAutoReplyBody || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplyBody,
          initialCancellationSubject:
            templateData?.cancellationSubject || DEFAULT_EMAIL_TEMPLATES.cancellationSubject,
          initialCancellationBody: templateData?.cancellationBody || DEFAULT_EMAIL_TEMPLATES.cancellationBody,
          initialShipmentCompleteSubject:
            templateData?.shipmentCompleteSubject || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteSubject,
          initialShipmentCompleteBody:
            templateData?.shipmentCompleteBody || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteBody,
          defaults: DEFAULT_EMAIL_TEMPLATES,
        }}
        scenarios={scenarioRows}
      />
    </div>
  );
}
