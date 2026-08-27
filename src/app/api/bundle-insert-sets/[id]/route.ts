import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  insertLabel: z.string().min(1).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetOrderType: z.enum(["subscription", "one_time", "both"]).optional(),
  targetCycleNumbers: z.array(z.number().int().positive()).nullable().optional(),
  targetProductIds: z.array(z.string().uuid()).nullable().optional(),
  description: z.string().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.periodStart && parsed.data.periodEnd && parsed.data.periodStart > parsed.data.periodEnd) {
    return NextResponse.json({ error: "開始日は終了日より前に指定してください" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bundle_insert_sets")
    .update({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.insertLabel !== undefined && { insert_label: parsed.data.insertLabel }),
      ...(parsed.data.periodStart !== undefined && { period_start: parsed.data.periodStart }),
      ...(parsed.data.periodEnd !== undefined && { period_end: parsed.data.periodEnd }),
      ...(parsed.data.targetOrderType !== undefined && { target_order_type: parsed.data.targetOrderType }),
      ...(parsed.data.targetCycleNumbers !== undefined && { target_cycle_numbers: parsed.data.targetCycleNumbers }),
      ...(parsed.data.targetProductIds !== undefined && { target_product_ids: parsed.data.targetProductIds }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    })
    .eq("id", id)
    .select("*, brands(id, name, code)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bundleInsertSet: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("bundle_insert_sets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
