import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdminRole } from "@/lib/require-role";
import { getDb } from "@/lib/db";
import { smaregiSyncLogs } from "@/db/schema";

/**
 * 【調査用・一時的なエンドポイント】スマレジ連携の実行結果(smaregi_sync_logs)を直近分だけ確認する。
 * 実際に送信したリクエスト内容とスマレジからのレスポンスを確認できる。読み取りのみ。admin限定。
 */
export async function GET() {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const data = await db
      .select({
        id: smaregiSyncLogs.id,
        order_id: smaregiSyncLogs.orderId,
        status: smaregiSyncLogs.status,
        error: smaregiSyncLogs.error,
        payload: smaregiSyncLogs.payload,
        created_at: smaregiSyncLogs.createdAt,
      })
      .from(smaregiSyncLogs)
      .orderBy(desc(smaregiSyncLogs.createdAt))
      .limit(5);

    return NextResponse.json({ logs: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
