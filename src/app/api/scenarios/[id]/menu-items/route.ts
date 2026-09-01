import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { scenarioMenuItems, scenarios } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { menuLayoutCapacity } from "@/lib/menu-layouts";

const menuItemSchema = z
  .object({
    label: z.string().min(1),
    actionType: z.enum(["node", "url", "business_calendar", "shopping_guide"]),
    targetNodeId: z.string().uuid().optional(),
    url: z.string().url().optional(),
  })
  .refine(
    (v) => {
      if (v.actionType === "node") return !!v.targetNodeId;
      if (v.actionType === "url") return !!v.url;
      return true;
    },
    { message: "actionTypeがnodeの場合はtargetNodeId、urlの場合はurlが必要です" },
  );

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId } = await params;

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(scenarioMenuItems)
      .where(eq(scenarioMenuItems.scenarioId, scenarioId))
      .orderBy(asc(scenarioMenuItems.displayOrder));
    return NextResponse.json({ menuItems: rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId } = await params;

  const body = await request.json();
  const parsed = menuItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();

    const [[scenarioRow], [{ value: currentCount }], [lastItem]] = await Promise.all([
      db.select({ menuLayoutKey: scenarios.menuLayoutKey }).from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1),
      db.select({ value: count() }).from(scenarioMenuItems).where(eq(scenarioMenuItems.scenarioId, scenarioId)),
      db
        .select({ displayOrder: scenarioMenuItems.displayOrder })
        .from(scenarioMenuItems)
        .where(eq(scenarioMenuItems.scenarioId, scenarioId))
        .orderBy(desc(scenarioMenuItems.displayOrder))
        .limit(1),
    ]);

    const capacity = menuLayoutCapacity(scenarioRow?.menuLayoutKey);
    if ((currentCount ?? 0) >= capacity) {
      return NextResponse.json(
        { error: `選択中のレイアウトの上限(${capacity}件)に達しています。追加するにはレイアウトを変更してください。` },
        { status: 400 },
      );
    }

    const displayOrder = (lastItem?.displayOrder ?? -1) + 1;

    const [row] = await db
      .insert(scenarioMenuItems)
      .values({
        scenarioId,
        label: input.label,
        actionType: input.actionType,
        targetNodeId: input.actionType === "node" ? input.targetNodeId : null,
        url: input.actionType === "url" ? input.url : null,
        displayOrder,
      })
      .returning();

    return NextResponse.json(
      {
        menuItem: {
          id: row.id,
          scenario_id: row.scenarioId,
          label: row.label,
          action_type: row.actionType,
          target_node_id: row.targetNodeId,
          url: row.url,
          display_order: row.displayOrder,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
