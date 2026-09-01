import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { checkoutMessages } from "@/db/schema";

type CheckoutMessageItem = { type: "image" | "text"; imageUrl?: string; linkUrl?: string; text?: string };

/** チャットウィジェット用: 決済フォームのあいさつ文・注文確認メッセージ・特商法/個人情報の本文(認証不要)。 */
export async function GET() {
  const db = await getDb();
  let data;
  try {
    [data] = await db.select().from(checkoutMessages).where(eq(checkoutMessages.id, 1)).limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const greetingItemsRaw = data?.greetingItems as CheckoutMessageItem[] | undefined;
  const greetingItems =
    greetingItemsRaw && greetingItemsRaw.length > 0
      ? greetingItemsRaw
      : data?.greeting
        ? [{ type: "text" as const, text: data.greeting }]
        : [];
  const completionItemsRaw = data?.completionItems as CheckoutMessageItem[] | undefined;
  const completionItems =
    completionItemsRaw && completionItemsRaw.length > 0
      ? completionItemsRaw
      : data?.completionMessage
        ? [{ type: "text" as const, text: data.completionMessage }]
        : [];

  return NextResponse.json({
    greetingItems,
    completionItems,
    privacyNotice: data?.privacyNotice || undefined,
    termsText: data?.termsText || undefined,
    privacyText: data?.privacyText || undefined,
    shoppingGuideText: data?.shoppingGuideText || undefined,
  });
}
