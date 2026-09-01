import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { scenarioMenuItems } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const menuItemUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  actionType: z.enum(["node", "url", "business_calendar", "shopping_guide"]).optional(),
  targetNodeId: z.string().uuid().nullable().optional(),
  url: z.string().url().nullable().optional(),
  displayOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, itemId } = await params;

  const body = await request.json();
  const parsed = menuItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();
    const [row] = await db
      .update(scenarioMenuItems)
      .set({
        ...(input.label !== undefined && { label: input.label }),
        ...(input.actionType !== undefined && { actionType: input.actionType }),
        ...(input.targetNodeId !== undefined && { targetNodeId: input.targetNodeId }),
        ...(input.url !== undefined && { url: input.url }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
      })
      .where(and(eq(scenarioMenuItems.id, itemId), eq(scenarioMenuItems.scenarioId, scenarioId)))
      .returning();

    return NextResponse.json({ menuItem: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, itemId } = await params;

  try {
    const db = await getDb();
    await db
      .delete(scenarioMenuItems)
      .where(and(eq(scenarioMenuItems.id, itemId), eq(scenarioMenuItems.scenarioId, scenarioId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
