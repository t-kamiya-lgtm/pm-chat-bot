import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** チャットウィジェット用: 決済フォームのあいさつ文・注文確認メッセージ・特商法/個人情報の本文(認証不要)。 */
export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("checkout_messages").select("*").eq("id", 1).maybeSingle();

  const greetingItems =
    data?.greeting_items?.length > 0
      ? data.greeting_items
      : data?.greeting
        ? [{ type: "text", text: data.greeting }]
        : [];
  const completionItems =
    data?.completion_items?.length > 0
      ? data.completion_items
      : data?.completion_message
        ? [{ type: "text", text: data.completion_message }]
        : [];

  return NextResponse.json({
    greetingItems,
    completionItems,
    privacyNotice: data?.privacy_notice || undefined,
    termsText: data?.terms_text || undefined,
    privacyText: data?.privacy_text || undefined,
    shoppingGuideText: data?.shopping_guide_text || undefined,
  });
}
