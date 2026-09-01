import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productFaqCategories } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  title: z.string().min(1),
  displayOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 商品種類(親品番)ごとのQAカテゴリ一覧。 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(productFaqCategories)
      .where(eq(productFaqCategories.productGroupId, id))
      .orderBy(asc(productFaqCategories.displayOrder));
    return NextResponse.json({ categories: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();

    let displayOrder = parsed.data.displayOrder;
    if (displayOrder === undefined) {
      const [existing] = await db
        .select({ displayOrder: productFaqCategories.displayOrder })
        .from(productFaqCategories)
        .where(eq(productFaqCategories.productGroupId, id))
        .orderBy(desc(productFaqCategories.displayOrder))
        .limit(1);
      displayOrder = (existing?.displayOrder ?? -1) + 1;
    }

    const [row] = await db
      .insert(productFaqCategories)
      .values({ productGroupId: id, title: parsed.data.title, displayOrder })
      .returning();

    return NextResponse.json({ category: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
