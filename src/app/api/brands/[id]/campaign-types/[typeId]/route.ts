import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string; typeId: string }> };

/**
 * 継続施策タイトルを削除する。既にログで使われているタイトルを消すと過去ログの表示に
 * 影響するため、削除前に使用有無を確認しユーザーに委ねる(呼び出し元でconfirmする想定)。
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, typeId } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("retention_campaign_types")
    .delete()
    .eq("id", typeId)
    .eq("brand_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
