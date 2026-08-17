import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/require-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * 【調査用・一時的なエンドポイント】スマレジ連携の実行結果(smaregi_sync_logs)を直近分だけ確認する。
 * 実際に送信したリクエスト内容とスマレジからのレスポンスを確認できる。読み取りのみ。admin限定。
 */
export async function GET() {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("smaregi_sync_logs")
    .select("id, order_id, status, error, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data });
}
