import { NextResponse } from "next/server";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { scenarioNodes } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { migrateCheckoutUpsellToProductNodes } from "@/lib/scenario-upsell-migration";

const nodeUpdateSchema = z.object({
  type: z
    .enum(["message", "choice", "product", "checkout", "product_qa", "image", "survey", "video", "coupon"])
    .optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  nextNodeMap: z.record(z.string(), z.string()).optional(),
  isEntry: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  memo: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, nodeId } = await params;

  const body = await request.json();
  const parsed = nodeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const db = await getDb();

  try {
    // 「開始ノードにする」は独立したフラグとして持たず、表示順を1番目にすることで表現する。
    // これにより、以後の並び替えで開始ノードの位置がずれる心配がなくなる。
    let displayOrder = input.displayOrder;
    if (input.isEntry) {
      const others = await db
        .select({ id: scenarioNodes.id })
        .from(scenarioNodes)
        .where(and(eq(scenarioNodes.scenarioId, scenarioId), ne(scenarioNodes.id, nodeId)))
        .orderBy(asc(scenarioNodes.displayOrder));
      if (others.length > 0) {
        await Promise.all(
          others.map((n, i) => db.update(scenarioNodes).set({ displayOrder: i + 1 }).where(eq(scenarioNodes.id, n.id))),
        );
      }
      displayOrder = 0;
    }

    const [data] = await db
      .update(scenarioNodes)
      .set({
        ...(input.type !== undefined && { type: input.type }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.nextNodeMap !== undefined && { nextNodeMap: input.nextNodeMap }),
        ...(displayOrder !== undefined && { displayOrder: displayOrder }),
        ...(input.memo !== undefined && { memo: input.memo }),
      })
      .where(and(eq(scenarioNodes.id, nodeId), eq(scenarioNodes.scenarioId, scenarioId)))
      .returning();

    return NextResponse.json({ node: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, nodeId } = await params;

  const db = await getDb();
  // 決済導線ノードは廃止済み。削除でアップセル・クロスセルの設定が失われないよう、
  // 先に商品提示ノードのマトリクスへ退避する。
  await migrateCheckoutUpsellToProductNodes(db, scenarioId, nodeId);
  try {
    await db.delete(scenarioNodes).where(and(eq(scenarioNodes.id, nodeId), eq(scenarioNodes.scenarioId, scenarioId)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
