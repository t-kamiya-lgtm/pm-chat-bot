import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bundleInsertItems } from "@/db/schema";
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

  const db = await getDb();
  try {
    const [data] = await db
      .update(bundleInsertItems)
      .set({
        ...(parsed.data.itemType !== undefined && { itemType: parsed.data.itemType }),
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.url !== undefined && { url: parsed.data.url }),
        ...(parsed.data.registeredDate !== undefined && { registeredDate: parsed.data.registeredDate }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      })
      .where(eq(bundleInsertItems.id, id))
      .returning();
    return NextResponse.json({ bundleInsertItem: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** 配布実績(この同梱物を含むセットの累計配布件数)が1件以上ある場合は削除できないようにする。 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const db = await getDb();
  let sets;
  try {
    ({ sets } = await listBundleInsertSetsWithDetails(db));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const distributedCount = sumItemDistribution(sets, id);
  if (distributedCount > 0) {
    return NextResponse.json(
      { error: `この同梱物は配布実績(累計${distributedCount}件)があるため削除できません` },
      { status: 400 },
    );
  }

  try {
    await db.delete(bundleInsertItems).where(eq(bundleInsertItems.id, id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
