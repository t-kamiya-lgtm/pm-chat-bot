import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { findConflictingSets, type BundleInsertSetCandidate } from "@/lib/bundle-insert-conflict";
import { countDistributedOrders } from "@/lib/bundle-insert-distribution";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  insertLabel: z.string().nullable().optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  targetOrderType: z.enum(["subscription", "one_time", "both"]).optional(),
  targetCycleNumbers: z.array(z.number().int().positive()).nullable().optional(),
  targetProductIds: z.array(z.string().uuid()).nullable().optional(),
  itemIds: z.array(z.string().uuid()).nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "draft"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  const { data: current, error: fetchError } = await supabase
    .from("bundle_insert_sets")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !current) return NextResponse.json({ error: "対象の同梱物設定が見つかりません" }, { status: 404 });

  const merged = {
    brandId: current.brand_id as string,
    periodStart: parsed.data.periodStart ?? (current.period_start as string),
    periodEnd: parsed.data.periodEnd !== undefined ? parsed.data.periodEnd : (current.period_end as string | null),
    targetOrderType: (parsed.data.targetOrderType ?? current.target_order_type) as
      | "subscription"
      | "one_time"
      | "both",
    targetCycleNumbers:
      parsed.data.targetCycleNumbers !== undefined
        ? parsed.data.targetCycleNumbers
        : (current.target_cycle_numbers as number[] | null),
    targetProductIds:
      parsed.data.targetProductIds !== undefined
        ? parsed.data.targetProductIds
        : (current.target_product_ids as string[] | null),
    status: parsed.data.status ?? (current.status as "active" | "draft"),
  };

  if (merged.periodEnd && merged.periodStart > merged.periodEnd) {
    return NextResponse.json({ error: "開始日は終了日より前に指定してください" }, { status: 400 });
  }

  if (merged.status === "active") {
    const { data: activeSetsRaw } = await supabase
      .from("bundle_insert_sets")
      .select(
        "id, name, brand_id, period_start, period_end, target_order_type, target_cycle_numbers, target_product_ids",
      )
      .eq("brand_id", merged.brandId)
      .eq("status", "active");
    const activeSets: (BundleInsertSetCandidate & { name: string })[] = (activeSetsRaw ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      brandId: s.brand_id as string,
      periodStart: s.period_start as string,
      periodEnd: s.period_end as string | null,
      targetOrderType: s.target_order_type as "subscription" | "one_time" | "both",
      targetCycleNumbers: s.target_cycle_numbers as number[] | null,
      targetProductIds: s.target_product_ids as string[] | null,
    }));
    const conflicts = findConflictingSets({ id, ...merged }, activeSets);
    if (conflicts.length > 0) {
      return NextResponse.json({ error: "対象条件が重複しています", conflicts }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("bundle_insert_sets")
    .update({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.insertLabel !== undefined && { insert_label: parsed.data.insertLabel || null }),
      ...(parsed.data.periodStart !== undefined && { period_start: parsed.data.periodStart }),
      ...(parsed.data.periodEnd !== undefined && { period_end: parsed.data.periodEnd }),
      ...(parsed.data.targetOrderType !== undefined && { target_order_type: parsed.data.targetOrderType }),
      ...(parsed.data.targetCycleNumbers !== undefined && { target_cycle_numbers: parsed.data.targetCycleNumbers }),
      ...(parsed.data.targetProductIds !== undefined && { target_product_ids: parsed.data.targetProductIds }),
      ...(parsed.data.itemIds !== undefined && { item_ids: parsed.data.itemIds }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bundleInsertSet: data });
}

/** 配布実績(対象条件に合致する注文数)が1件以上ある場合は削除できないようにする(①同梱物登録と同様の制御)。 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();

  const { data: current, error: fetchError } = await supabase
    .from("bundle_insert_sets")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !current) return NextResponse.json({ error: "対象の同梱物設定が見つかりません" }, { status: 404 });

  const distributedCount = await countDistributedOrders(supabase, {
    brandId: current.brand_id as string,
    periodStart: current.period_start as string,
    periodEnd: current.period_end as string | null,
    targetOrderType: current.target_order_type as "subscription" | "one_time" | "both",
    targetCycleNumbers: current.target_cycle_numbers as number[] | null,
    targetProductIds: current.target_product_ids as string[] | null,
  });
  if (distributedCount > 0) {
    return NextResponse.json(
      { error: `この同梱物設定は配布実績(累計${distributedCount}件)があるため削除できません` },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("bundle_insert_sets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
