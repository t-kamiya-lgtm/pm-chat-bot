import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().min(1),
  insertLabel: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetOrderType: z.enum(["subscription", "one_time", "both"]).default("both"),
  targetCycleNumbers: z.array(z.number().int().positive()).nullable().optional(),
  targetProductIds: z.array(z.string().uuid()).nullable().optional(),
  description: z.string().optional(),
});

/**
 * 同梱物セット一覧・登録。定期分析(同梱効果測定)のセグメント軸として使う。
 * brandsとの結合(embed)はPostgRESTのリレーションキャッシュが新しいFKに追随するまで
 * 失敗することがあるため使わず、別々に取得してJS側で紐付ける。
 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const [setsRes, brandsRes] = await Promise.all([
    supabase.from("bundle_insert_sets").select("*").order("period_start", { ascending: false }),
    supabase.from("brands").select("id, name, code"),
  ]);
  if (setsRes.error) return NextResponse.json({ error: setsRes.error.message }, { status: 500 });
  if (brandsRes.error) return NextResponse.json({ error: brandsRes.error.message }, { status: 500 });

  const brandById = new Map((brandsRes.data ?? []).map((b) => [b.id as string, b]));
  const bundleInsertSets = (setsRes.data ?? []).map((set) => ({
    ...set,
    brands: brandById.get(set.brand_id as string) ?? null,
  }));

  return NextResponse.json({ bundleInsertSets });
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.periodStart > parsed.data.periodEnd) {
    return NextResponse.json({ error: "開始日は終了日より前に指定してください" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bundle_insert_sets")
    .insert({
      brand_id: parsed.data.brandId,
      name: parsed.data.name,
      insert_label: parsed.data.insertLabel,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      target_order_type: parsed.data.targetOrderType,
      target_cycle_numbers: parsed.data.targetCycleNumbers ?? null,
      target_product_ids: parsed.data.targetProductIds ?? null,
      description: parsed.data.description || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bundleInsertSet: data }, { status: 201 });
}
