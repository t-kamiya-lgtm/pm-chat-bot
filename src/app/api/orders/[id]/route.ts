import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z
  .object({
    importStatus: z.enum(["imported", "on_hold", "not_imported", "import_error", "excluded"]).optional(),
    canceled: z.boolean().optional(),
  })
  .refine((data) => data.importStatus !== undefined || data.canceled !== undefined, {
    message: "importStatus または canceled のいずれかを指定してください",
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
  const { data, error } = await supabase
    .from("orders")
    .update({
      ...(parsed.data.importStatus !== undefined && {
        import_status: parsed.data.importStatus,
        import_status_updated_at: new Date().toISOString(),
      }),
      ...(parsed.data.canceled !== undefined && {
        canceled_at: parsed.data.canceled ? new Date().toISOString() : null,
      }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}
