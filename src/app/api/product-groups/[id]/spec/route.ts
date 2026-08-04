import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const specInputSchema = z.object({
  ingredients: z.string().optional(),
  allergens: z.string().optional(),
  volume: z.string().optional(),
  usage: z.string().optional(),
  nutrition: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).default({}),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_specs")
    .select("*")
    .eq("product_group_id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ spec: data });
}

/** 商品種類(親品番)の仕様情報を登録/更新する。商品QA生成の入力データ。 */
export async function PUT(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = specInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_specs")
    .upsert(
      {
        product_group_id: id,
        ingredients: input.ingredients ?? null,
        allergens: input.allergens ?? null,
        volume: input.volume ?? null,
        usage: input.usage ?? null,
        nutrition: input.nutrition ?? null,
        extra: input.extra,
      },
      { onConflict: "product_group_id" },
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ spec: data });
}
