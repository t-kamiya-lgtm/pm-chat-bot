import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  title: z.string().min(1),
  displayOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 商品種類(親品番)ごとのQAカテゴリ一覧。 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_faq_categories")
    .select("*")
    .eq("product_group_id", id)
    .order("display_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data });
}

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  let displayOrder = parsed.data.displayOrder;
  if (displayOrder === undefined) {
    const { data: existing } = await supabase
      .from("product_faq_categories")
      .select("display_order")
      .eq("product_group_id", id)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    displayOrder = (existing?.display_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("product_faq_categories")
    .insert({ product_group_id: id, title: parsed.data.title, display_order: displayOrder })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data }, { status: 201 });
}
