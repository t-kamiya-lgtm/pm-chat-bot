import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CheckoutMessagesForm } from "@/components/admin/CheckoutMessagesForm";

export const dynamic = "force-dynamic";

export default async function BasicSettingsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: messages } = await supabase.from("checkout_messages").select("*").eq("id", 1).maybeSingle();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">基本設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        全商品共通のあいさつ文・注文確認メッセージです(決済フォーム開始時・注文確定後にチャット上へ自動表示されます)。
        決済フォームの質問順は、各シナリオの編集画面で設定します。
      </p>
      <CheckoutMessagesForm
        initialGreetingItems={
          messages?.greeting_items?.length > 0
            ? messages.greeting_items
            : messages?.greeting
              ? [{ type: "text", text: messages.greeting }]
              : []
        }
        initialCompletionItems={
          messages?.completion_items?.length > 0
            ? messages.completion_items
            : messages?.completion_message
              ? [{ type: "text", text: messages.completion_message }]
              : []
        }
        initialPrivacyNotice={messages?.privacy_notice ?? ""}
        initialTermsText={messages?.terms_text ?? ""}
        initialPrivacyText={messages?.privacy_text ?? ""}
        initialShoppingGuideText={messages?.shopping_guide_text ?? ""}
      />
    </div>
  );
}
