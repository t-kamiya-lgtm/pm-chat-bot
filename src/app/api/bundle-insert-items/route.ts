import { NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bundleInsertItems, brands } from "@/db/schema";
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

  const db = await getDb();
  try {
    const [itemRows, brandRows, { sets }] = await Promise.all([
      db.select().from(bundleInsertItems).orderBy(desc(bundleInsertItems.registeredDate)),
      db.select({ id: brands.id, name: brands.name, code: brands.code }).from(brands),
      listBundleInsertSetsWithDetails(db),
    ]);

    const brandById = new Map(brandRows.map((b) => [b.id, b]));
    const items = itemRows.map((item) => ({
      id: item.id,
      brand_id: item.brandId,
      item_type: item.itemType,
      name: item.name,
      registered_date: item.registeredDate,
      url: item.url,
      status: item.status,
      brands: brandById.get(item.brandId) ?? null,
      distributedCount: sumItemDistribution(sets, item.id),
    }));

    return NextResponse.json({ bundleInsertItems: items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = await getDb();
  try {
    const [data] = await db
      .insert(bundleInsertItems)
      .values({
        brandId: parsed.data.brandId,
        itemType: parsed.data.itemType,
        name: parsed.data.name,
        url: parsed.data.url || null,
        ...(parsed.data.registeredDate && { registeredDate: parsed.data.registeredDate }),
      })
      .returning();
    return NextResponse.json({ bundleInsertItem: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
