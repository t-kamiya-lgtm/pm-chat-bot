import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bundleInsertSets } from "@/db/schema";
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

  const db = await getDb();

  let current;
  try {
    [current] = await db.select().from(bundleInsertSets).where(eq(bundleInsertSets.id, id)).limit(1);
  } catch {
    current = null;
  }
  if (!current) return NextResponse.json({ error: "対象の同梱物設定が見つかりません" }, { status: 404 });

  const merged = {
    brandId: current.brandId,
    periodStart: parsed.data.periodStart ?? current.periodStart,
    periodEnd: parsed.data.periodEnd !== undefined ? parsed.data.periodEnd : current.periodEnd,
    targetOrderType: (parsed.data.targetOrderType ?? current.targetOrderType) as
      | "subscription"
      | "one_time"
      | "both",
    targetCycleNumbers:
      parsed.data.targetCycleNumbers !== undefined ? parsed.data.targetCycleNumbers : current.targetCycleNumbers,
    targetProductIds:
      parsed.data.targetProductIds !== undefined ? parsed.data.targetProductIds : current.targetProductIds,
    status: (parsed.data.status ?? current.status) as "active" | "draft",
  };

  if (merged.periodEnd && merged.periodStart > merged.periodEnd) {
    return NextResponse.json({ error: "開始日は終了日より前に指定してください" }, { status: 400 });
  }

  if (merged.status === "active") {
    const activeSetsRaw = await db
      .select({
        id: bundleInsertSets.id,
        name: bundleInsertSets.name,
        brandId: bundleInsertSets.brandId,
        periodStart: bundleInsertSets.periodStart,
        periodEnd: bundleInsertSets.periodEnd,
        targetOrderType: bundleInsertSets.targetOrderType,
        targetCycleNumbers: bundleInsertSets.targetCycleNumbers,
        targetProductIds: bundleInsertSets.targetProductIds,
      })
      .from(bundleInsertSets)
      .where(and(eq(bundleInsertSets.brandId, merged.brandId), eq(bundleInsertSets.status, "active")));
    const activeSets: (BundleInsertSetCandidate & { name: string })[] = activeSetsRaw.map((s) => ({
      id: s.id,
      name: s.name,
      brandId: s.brandId,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      targetOrderType: s.targetOrderType as "subscription" | "one_time" | "both",
      targetCycleNumbers: s.targetCycleNumbers,
      targetProductIds: s.targetProductIds,
    }));
    const conflicts = findConflictingSets({ id, ...merged }, activeSets);
    if (conflicts.length > 0) {
      return NextResponse.json({ error: "対象条件が重複しています", conflicts }, { status: 409 });
    }
  }

  try {
    const [data] = await db
      .update(bundleInsertSets)
      .set({
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.insertLabel !== undefined && { insertLabel: parsed.data.insertLabel || null }),
        ...(parsed.data.periodStart !== undefined && { periodStart: parsed.data.periodStart }),
        ...(parsed.data.periodEnd !== undefined && { periodEnd: parsed.data.periodEnd }),
        ...(parsed.data.targetOrderType !== undefined && { targetOrderType: parsed.data.targetOrderType }),
        ...(parsed.data.targetCycleNumbers !== undefined && { targetCycleNumbers: parsed.data.targetCycleNumbers }),
        ...(parsed.data.targetProductIds !== undefined && { targetProductIds: parsed.data.targetProductIds }),
        ...(parsed.data.itemIds !== undefined && { itemIds: parsed.data.itemIds }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      })
      .where(eq(bundleInsertSets.id, id))
      .returning();
    return NextResponse.json({ bundleInsertSet: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** 配布実績(対象条件に合致する注文数)が1件以上ある場合は削除できないようにする(①同梱物登録と同様の制御)。 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const db = await getDb();

  let current;
  try {
    [current] = await db.select().from(bundleInsertSets).where(eq(bundleInsertSets.id, id)).limit(1);
  } catch {
    current = null;
  }
  if (!current) return NextResponse.json({ error: "対象の同梱物設定が見つかりません" }, { status: 404 });

  const distributedCount = await countDistributedOrders(db, {
    brandId: current.brandId,
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    targetOrderType: current.targetOrderType as "subscription" | "one_time" | "both",
    targetCycleNumbers: current.targetCycleNumbers,
    targetProductIds: current.targetProductIds,
  });
  if (distributedCount > 0) {
    return NextResponse.json(
      { error: `この同梱物設定は配布実績(累計${distributedCount}件)があるため削除できません` },
      { status: 400 },
    );
  }

  try {
    await db.delete(bundleInsertSets).where(eq(bundleInsertSets.id, id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
