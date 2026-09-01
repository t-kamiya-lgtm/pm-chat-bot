import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { checkoutFieldOrder } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { CHECKOUT_FIELD_KEYS } from "@/lib/checkout-fields";

const updateSchema = z.object({
  scenarioId: z.string().uuid(),
  order: z.array(z.enum(CHECKOUT_FIELD_KEYS as [string, ...string[]])).length(CHECKOUT_FIELD_KEYS.length),
});

/** 管理画面用: 決済フォーム(1問1答)の質問表示順(シナリオ単位)。 */
export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");
  if (!scenarioId) return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(checkoutFieldOrder)
      .where(eq(checkoutFieldOrder.scenarioId, scenarioId))
      .orderBy(asc(checkoutFieldOrder.displayOrder));
    return NextResponse.json({ fields: rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** 質問順を一括更新する。orderには全フィールドキーを希望の表示順で渡す。 */
export async function PATCH(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();
    await Promise.all(
      parsed.data.order.map((fieldKey, index) =>
        db
          .insert(checkoutFieldOrder)
          .values({ scenarioId: parsed.data.scenarioId, fieldKey, displayOrder: index })
          .onConflictDoUpdate({
            target: [checkoutFieldOrder.scenarioId, checkoutFieldOrder.fieldKey],
            set: { displayOrder: index },
          }),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
