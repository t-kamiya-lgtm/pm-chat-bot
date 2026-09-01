import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { scenarioNodes } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const nodeSchema = z.object({
  type: z.enum(["message", "choice", "product", "checkout", "product_qa", "image", "survey", "video", "coupon"]),
  content: z.record(z.string(), z.unknown()).default({}),
  nextNodeMap: z.record(z.string(), z.string()).default({}),
  memo: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId } = await params;

  const body = await request.json();
  const parsed = nodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();

    const [lastNode] = await db
      .select({ displayOrder: scenarioNodes.displayOrder })
      .from(scenarioNodes)
      .where(eq(scenarioNodes.scenarioId, scenarioId))
      .orderBy(desc(scenarioNodes.displayOrder))
      .limit(1);
    const displayOrder = (lastNode?.displayOrder ?? -1) + 1;

    const [row] = await db
      .insert(scenarioNodes)
      .values({
        scenarioId,
        type: input.type,
        content: input.content,
        nextNodeMap: input.nextNodeMap,
        displayOrder,
        memo: input.memo ?? null,
      })
      .returning();

    return NextResponse.json({ node: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
