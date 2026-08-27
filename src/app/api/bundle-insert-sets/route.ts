import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { findConflictingSets, type BundleInsertSetCandidate } from "@/lib/bundle-insert-conflict";
import { listBundleInsertSetsWithDetails } from "@/lib/bundle-insert-sets-query";

const createSchema = z.object({
  brandId: z.string().uuid(),
  name: z.string().min(1),
  insertLabel: z.string().optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  targetOrderType: z.enum(["subscription", "one_time", "both"]).default("both"),
  targetCycleNumbers: z.array(z.number().int().positive()).nullable().optional(),
  targetProductIds: z.array(z.string().uuid()).nullable().optional(),
  itemIds: z.array(z.string().uuid()).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "draft"]).default("active"),
});

/**
 * 同梱物セット一覧・登録。定期分析(同梱効果測定)のセグメント軸として使う。
 * brandsとの結合(embed)はPostgRESTのリレーションキャッシュが新しいFKに追随するまで
 * 失敗することがあるため使わず、別々に取得してJS側で紐付ける。
 * 一覧では、対象条件に合致する注文数(累計配布件数)もあわせて計算して返す。
 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { sets, error } = await listBundleInsertSetsWithDetails(supabase);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ bundleInsertSets: sets });
}

async function fetchActiveSetsForConflictCheck(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  brandId: string,
): Promise<(BundleInsertSetCandidate & { name: string })[]> {
  const { data } = await supabase
    .from("bundle_insert_sets")
    .select("id, name, brand_id, period_start, period_end, target_order_type, target_cycle_numbers, target_product_ids")
    .eq("brand_id", brandId)
    .eq("status", "active");
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    brandId: s.brand_id as string,
    periodStart: s.period_start as string,
    periodEnd: s.period_end as string | null,
    targetOrderType: s.target_order_type as "subscription" | "one_time" | "both",
    targetCycleNumbers: s.target_cycle_numbers as number[] | null,
    targetProductIds: s.target_product_ids as string[] | null,
  }));
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const periodEnd = parsed.data.periodEnd ?? null;
  if (periodEnd && parsed.data.periodStart > periodEnd) {
    return NextResponse.json({ error: "開始日は終了日より前に指定してください" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  if (parsed.data.status === "active") {
    const activeSets = await fetchActiveSetsForConflictCheck(supabase, parsed.data.brandId);
    const conflicts = findConflictingSets(
      {
        brandId: parsed.data.brandId,
        periodStart: parsed.data.periodStart,
        periodEnd,
        targetOrderType: parsed.data.targetOrderType,
        targetCycleNumbers: parsed.data.targetCycleNumbers ?? null,
        targetProductIds: parsed.data.targetProductIds ?? null,
      },
      activeSets,
    );
    if (conflicts.length > 0) {
      return NextResponse.json({ error: "対象条件が重複しています", conflicts }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("bundle_insert_sets")
    .insert({
      brand_id: parsed.data.brandId,
      name: parsed.data.name,
      insert_label: parsed.data.insertLabel || null,
      period_start: parsed.data.periodStart,
      period_end: periodEnd,
      target_order_type: parsed.data.targetOrderType,
      target_cycle_numbers: parsed.data.targetCycleNumbers ?? null,
      target_product_ids: parsed.data.targetProductIds ?? null,
      item_ids: parsed.data.itemIds ?? null,
      description: parsed.data.description || null,
      status: parsed.data.status,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bundleInsertSet: data }, { status: 201 });
}
