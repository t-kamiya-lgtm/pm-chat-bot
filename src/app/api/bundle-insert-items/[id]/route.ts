import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { listBundleInsertSetsWithDetails, sumItemDistribution } from "@/lib/bundle-insert-sets-query";

const updateSchema = z.object({
  itemType: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  url: z.string().url().nullable().optional(),
  registeredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["active", "inactive"]).optional(),
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
  const { data, error } = await supabase
    .from("bundle_insert_items")
    .update({
      ...(parsed.data.itemType !== undefined && { item_type: parsed.data.itemType }),
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.url !== undefined && { url: parsed.data.url }),
      ...(parsed.data.registeredDate !== undefined && { registered_date: parsed.data.registeredDate }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bundleInsertItem: data });
}

/** 配布実績(この同梱物を含むセットの累計配布件数)が1件以上ある場合は削除できないようにする。 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { sets, error: setsError } = await listBundleInsertSetsWithDetails(supabase);
  if (setsError) return NextResponse.json({ error: setsError }, { status: 500 });

  const distributedCount = sumItemDistribution(sets, id);
  if (distributedCount > 0) {
    return NextResponse.json(
      { error: `この同梱物は配布実績(累計${distributedCount}件)があるため削除できません` },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("bundle_insert_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
