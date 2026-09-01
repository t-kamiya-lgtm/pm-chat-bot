import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bundleInsertSets } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { findConflictingSets, type BundleInsertSetCandidate } from "@/lib/bundle-insert-conflict";
import { listBundleInsertSetsWithDetails } from "@/lib/bundle-insert-sets-query";
import type { Db } from "@/lib/db";

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

  const db = await getDb();
  try {
    const { sets } = await listBundleInsertSetsWithDetails(db);
    return NextResponse.json({ bundleInsertSets: sets });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

async function fetchActiveSetsForConflictCheck(
  db: Db,
  brandId: string,
): Promise<(BundleInsertSetCandidate & { name: string })[]> {
  const data = await db
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
    .where(and(eq(bundleInsertSets.brandId, brandId), eq(bundleInsertSets.status, "active")));
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    brandId: s.brandId,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    targetOrderType: s.targetOrderType as "subscription" | "one_time" | "both",
    targetCycleNumbers: s.targetCycleNumbers,
    targetProductIds: s.targetProductIds,
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

  const db = await getDb();

  if (parsed.data.status === "active") {
    const activeSets = await fetchActiveSetsForConflictCheck(db, parsed.data.brandId);
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

  try {
    const [data] = await db
      .insert(bundleInsertSets)
      .values({
        brandId: parsed.data.brandId,
        name: parsed.data.name,
        insertLabel: parsed.data.insertLabel || null,
        periodStart: parsed.data.periodStart,
        periodEnd: periodEnd,
        targetOrderType: parsed.data.targetOrderType,
        targetCycleNumbers: parsed.data.targetCycleNumbers ?? null,
        targetProductIds: parsed.data.targetProductIds ?? null,
        itemIds: parsed.data.itemIds ?? null,
        description: parsed.data.description || null,
        status: parsed.data.status,
      })
      .returning();
    return NextResponse.json({ bundleInsertSet: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
