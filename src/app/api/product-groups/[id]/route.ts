import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroups, products } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parentCode: z.string().optional(),
  brandId: z.string().uuid().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const [[productGroup], productRows] = await Promise.all([
      db.select().from(productGroups).where(eq(productGroups.id, id)).limit(1),
      db.select().from(products).where(eq(products.productGroupId, id)).orderBy(asc(products.createdAt)),
    ]);

    if (!productGroup) return NextResponse.json({ error: "not found" }, { status: 404 });

    return NextResponse.json({ productGroup, products: productRows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();
    const [row] = await db
      .update(productGroups)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.parentCode !== undefined && { parentCode: input.parentCode }),
        ...(input.brandId !== undefined && { brandId: input.brandId }),
      })
      .where(eq(productGroups.id, id))
      .returning();
    return NextResponse.json({ productGroup: row });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    await db.delete(productGroups).where(eq(productGroups.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
