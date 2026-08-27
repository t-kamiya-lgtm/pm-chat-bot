import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { listBundleInsertSetsWithDetails, sumItemDistribution } from "@/lib/bundle-insert-sets-query";

const createSchema = z.object({
  brandId: z.string().uuid(),
  itemType: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url().optional(),
  registeredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * 同梱物マスタ(①同梱物登録)の一覧・登録。②同梱物設定でセットに組み込む対象として使う。
 * 一覧では、この同梱物を含むセットの累計配布件数(distributedCount)もあわせて返す
 * (配布実績のある同梱物は削除できないようにするため)。
 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const [itemsRes, brandsRes, { sets, error: setsError }] = await Promise.all([
    supabase.from("bundle_insert_items").select("*").order("registered_date", { ascending: false }),
    supabase.from("brands").select("id, name, code"),
    listBundleInsertSetsWithDetails(supabase),
  ]);
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  if (brandsRes.error) return NextResponse.json({ error: brandsRes.error.message }, { status: 500 });
  if (setsError) return NextResponse.json({ error: setsError }, { status: 500 });

  const brandById = new Map((brandsRes.data ?? []).map((b) => [b.id as string, b]));
  const bundleInsertItems = (itemsRes.data ?? []).map((item) => ({
    ...item,
    brands: brandById.get(item.brand_id as string) ?? null,
    distributedCount: sumItemDistribution(sets, item.id as string),
  }));

  return NextResponse.json({ bundleInsertItems });
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bundle_insert_items")
    .insert({
      brand_id: parsed.data.brandId,
      item_type: parsed.data.itemType,
      name: parsed.data.name,
      url: parsed.data.url || null,
      ...(parsed.data.registeredDate && { registered_date: parsed.data.registeredDate }),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bundleInsertItem: data }, { status: 201 });
}
