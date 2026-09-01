import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { checkoutMessages } from "@/db/schema";
import { CheckoutMessagesForm } from "@/components/admin/CheckoutMessagesForm";

export const dynamic = "force-dynamic";

type CheckoutMessageItem = { type: "image" | "text"; imageUrl?: string; linkUrl?: string; text?: string };

export default async function BasicSettingsPage() {
  let messages: typeof checkoutMessages.$inferSelect | undefined;
  let loadError: string | null = null;
  try {
    const db = await getDb();
    [messages] = await db.select().from(checkoutMessages).where(eq(checkoutMessages.id, 1)).limit(1);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error("[admin/checkout-fields] failed to load checkout messages", err);
  }

  const greetingItemsRaw = messages?.greetingItems as CheckoutMessageItem[] | undefined;
  const initialGreetingItems =
    greetingItemsRaw && greetingItemsRaw.length > 0
      ? greetingItemsRaw
      : messages?.greeting
        ? [{ type: "text" as const, text: messages.greeting }]
        : [];
  const completionItemsRaw = messages?.completionItems as CheckoutMessageItem[] | undefined;
  const initialCompletionItems =
    completionItemsRaw && completionItemsRaw.length > 0
      ? completionItemsRaw
      : messages?.completionMessage
        ? [{ type: "text" as const, text: messages.completionMessage }]
        : [];

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">基本設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        全商品共通のあいさつ文・注文確認メッセージです(決済フォーム開始時・注文確定後にチャット上へ自動表示されます)。
        決済フォームの質問順は、各シナリオの編集画面で設定します。
      </p>
      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          設定の取得に失敗しました({loadError})
        </p>
      )}
      <CheckoutMessagesForm
        initialGreetingItems={initialGreetingItems}
        initialCompletionItems={initialCompletionItems}
        initialPrivacyNotice={messages?.privacyNotice ?? ""}
        initialTermsText={messages?.termsText ?? ""}
        initialPrivacyText={messages?.privacyText ?? ""}
        initialShoppingGuideText={messages?.shoppingGuideText ?? ""}
      />
    </div>
  );
}
