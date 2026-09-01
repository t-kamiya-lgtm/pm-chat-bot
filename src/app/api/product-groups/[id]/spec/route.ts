import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productSpecs } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const specInputSchema = z.object({
  ingredients: z.string().optional(),
  allergens: z.string().optional(),
  volume: z.string().optional(),
  usage: z.string().optional(),
  nutrition: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).default({}),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const [row] = await db.select().from(productSpecs).where(eq(productSpecs.productGroupId, id)).limit(1);
    return NextResponse.json({ spec: row ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** 商品種類(親品番)の仕様情報を登録/更新する。商品QA生成の入力データ。 */
export async function PUT(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = specInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();
    const [row] = await db
      .insert(productSpecs)
      .values({
        productGroupId: id,
        ingredients: input.ingredients ?? null,
        allergens: input.allergens ?? null,
        volume: input.volume ?? null,
        usage: input.usage ?? null,
        nutrition: input.nutrition ?? null,
        extra: input.extra,
      })
      .onConflictDoUpdate({
        target: productSpecs.productGroupId,
        set: {
          ingredients: input.ingredients ?? null,
          allergens: input.allergens ?? null,
          volume: input.volume ?? null,
          usage: input.usage ?? null,
          nutrition: input.nutrition ?? null,
          extra: input.extra,
        },
      })
      .returning();

    return NextResponse.json({ spec: row });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
