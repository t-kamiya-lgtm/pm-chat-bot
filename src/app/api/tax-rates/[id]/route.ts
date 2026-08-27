import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 使用中(商品ジャンルの期間設定から参照されている)の税率メニューは削除できないようにする
 * (過去の注文のスナップショットには影響しないが、設定の参照整合性のため)。
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data: usedIn } = await supabase.from("product_group_tax_rates").select("id").eq("tax_rate_id", id).limit(1);
  if (usedIn && usedIn.length > 0) {
    return NextResponse.json({ error: "この税率は商品ジャンルの期間設定で使用中のため削除できません" }, { status: 400 });
  }

  const { error } = await supabase.from("tax_rates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
