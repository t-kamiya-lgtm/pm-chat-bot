import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { businessClosedDates } from "@/db/schema";

/**
 * チャットウィジェット用の公開エンドポイント(認証不要)。
 * 配送日計算に使う、管理画面で追加登録された休業日の一覧(日付のみ)を返す。
 * 祝日・土日はクライアント側で計算するため含まない。
 */
export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.select({ date: businessClosedDates.date }).from(businessClosedDates);
    return NextResponse.json({ closedDates: rows.map((row) => row.date) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
