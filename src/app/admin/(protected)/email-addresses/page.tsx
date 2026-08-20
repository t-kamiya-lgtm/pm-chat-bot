import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailAddressesTable, type ScenarioEmailRow } from "@/components/admin/EmailAddressesTable";

export const dynamic = "force-dynamic";

export default async function EmailAddressesPage() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("scenarios")
    .select(
      "id, name, email_from_address, inquiry_receive_email, inquiry_auto_reply_from, order_confirmation_from, abandoned_reminder_from, cancellation_from, shipment_complete_from",
    )
    .order("display_order", { ascending: true });

  const rows: ScenarioEmailRow[] = (data ?? []).map((s) => ({
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
      <h1 className="mb-2 text-2xl font-semibold">メールアドレス管理</h1>
      <p className="mb-6 text-sm text-neutral-500">
        シナリオ(ブランド)ごとに、メール種別ごとの宛先・送信元アドレスを設定できます。
        ①問い合わせ受領アドレスは社内担当者への通知メール宛先、それ以外はお客様へ送るメールの送信元アドレスです。
      </p>
      {error && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          シナリオ一覧の取得に失敗しました({error.message})
        </p>
      )}
      <EmailAddressesTable scenarios={rows} />
    </div>
  );
}
