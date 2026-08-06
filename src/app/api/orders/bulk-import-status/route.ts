import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const bulkUpdateSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1),
  importStatus: z.enum(["imported", "on_hold", "not_imported"]),
});

/** 選択した複数注文の取り込みステータスを一括で変更する。 */
export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      import_status: parsed.data.importStatus,
      import_status_updated_at: new Date().toISOString(),
    })
    .in("id", parsed.data.orderIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: parsed.data.orderIds.length });
}
