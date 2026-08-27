import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string; actionId: string }> };

/** 誤って記録した継続施策ログを削除する。 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, actionId } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("customer_retention_actions")
    .delete()
    .eq("id", actionId)
    .eq("customer_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
