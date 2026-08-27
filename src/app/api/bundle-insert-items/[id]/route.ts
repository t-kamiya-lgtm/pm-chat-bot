import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  itemType: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  registeredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
      ...(parsed.data.registeredDate !== undefined && { registered_date: parsed.data.registeredDate }),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bundleInsertItem: data });
}

/**
 * 同梱物設定(bundle_insert_sets.item_ids)から参照されている場合は削除できないようにする
 * (過去のセットの内訳表示が壊れるため)。
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data: usedIn } = await supabase
    .from("bundle_insert_sets")
    .select("id, name")
    .contains("item_ids", [id]);
  if (usedIn && usedIn.length > 0) {
    return NextResponse.json(
      { error: `この同梱物は同梱物設定「${usedIn.map((s) => s.name).join("、")}」で使用中のため削除できません` },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("bundle_insert_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
