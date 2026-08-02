import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parentCode: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const [{ data: productGroup, error: groupError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase.from("product_groups").select("*").eq("id", id).maybeSingle(),
      supabase.from("products").select("*").eq("product_group_id", id).order("created_at"),
    ]);

  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });
  if (!productGroup) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });

  return NextResponse.json({ productGroup, products });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_groups")
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.parentCode !== undefined && { parent_code: input.parentCode }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ productGroup: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("product_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
