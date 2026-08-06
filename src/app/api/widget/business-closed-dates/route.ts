import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * チャットウィジェット用の公開エンドポイント(認証不要)。
 * 配送日計算に使う、管理画面で追加登録された休業日の一覧(日付のみ)を返す。
 * 祝日・土日はクライアント側で計算するため含まない。
 */
export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("business_closed_dates").select("date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ closedDates: (data ?? []).map((row) => row.date) });
}
