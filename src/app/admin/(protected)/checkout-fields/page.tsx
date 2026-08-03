import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CheckoutFieldOrderManager } from "@/components/admin/CheckoutFieldOrderManager";
import { CheckoutMessagesForm } from "@/components/admin/CheckoutMessagesForm";
import { DEFAULT_CHECKOUT_FIELD_ORDER, type CheckoutFieldKey } from "@/lib/checkout-fields";

export const dynamic = "force-dynamic";

export default async function CheckoutFieldsPage() {
  const supabase = createSupabaseAdminClient();
  const [{ data }, { data: messages }] = await Promise.all([
    supabase.from("checkout_field_order").select("field_key").order("display_order", { ascending: true }),
    supabase.from("checkout_messages").select("*").eq("id", 1).maybeSingle(),
  ]);

  const order =
    data && data.length > 0
      ? (data.map((row) => row.field_key) as CheckoutFieldKey[])
      : DEFAULT_CHECKOUT_FIELD_ORDER;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">決済フォームの質問順</h1>
      <p className="mb-6 text-sm text-neutral-500">
        チャット上の決済フォームは1問1答形式で表示されます。ここで表示順を変更できます(▲▼で入れ替え、即時保存されます)。
      </p>
      <CheckoutFieldOrderManager initialOrder={order} />

      <h2 className="mt-10 mb-2 text-2xl font-semibold">あいさつ文・注文確認メッセージ</h2>
      <p className="mb-6 text-sm text-neutral-500">
        全商品共通のテンプレートとして、決済フォーム開始時・注文確定後にチャット上へ自動表示されます。
      </p>
      <CheckoutMessagesForm
        initialGreeting={messages?.greeting ?? ""}
        initialCompletionMessage={messages?.completion_message ?? ""}
        initialTermsText={messages?.terms_text ?? ""}
        initialPrivacyText={messages?.privacy_text ?? ""}
      />
    </div>
  );
}
