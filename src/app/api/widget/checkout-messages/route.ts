import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** チャットウィジェット用: 決済フォームのあいさつ文・注文確認メッセージ(認証不要)。 */
export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("checkout_messages").select("*").eq("id", 1).maybeSingle();
  return NextResponse.json({
    greeting: data?.greeting || undefined,
    completionMessage: data?.completion_message || undefined,
  });
}
