import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string; assignmentId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, assignmentId } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("product_group_tax_rates")
    .delete()
    .eq("id", assignmentId)
    .eq("product_group_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
