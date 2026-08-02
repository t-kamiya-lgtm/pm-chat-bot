import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  displayOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string; categoryId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, categoryId } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_faq_categories")
    .update({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.displayOrder !== undefined && { display_order: input.displayOrder }),
    })
    .eq("id", categoryId)
    .eq("product_group_id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, categoryId } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("product_faq_categories")
    .delete()
    .eq("id", categoryId)
    .eq("product_group_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
