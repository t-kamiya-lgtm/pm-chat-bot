import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { sendCancellationEmail } from "@/lib/order-status-emails";
import { applyImportStatusChange } from "@/lib/order-import-status";

const updateSchema = z.object({
  importStatus: z.enum([
    "imported",
    "on_hold",
    "not_imported",
    "import_error",
    "excluded",
    "shipped",
    "canceled",
  ]),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const result = await applyImportStatusChange(supabase, id, parsed.data.importStatus);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.importStatus === "canceled") {
    await sendCancellationEmail(id);
  }

  return NextResponse.json({ order: data });
}
