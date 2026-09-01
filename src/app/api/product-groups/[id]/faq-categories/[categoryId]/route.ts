import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productFaqCategories } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  displayOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string; categoryId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, categoryId } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();
    const [row] = await db
      .update(productFaqCategories)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
      })
      .where(and(eq(productFaqCategories.id, categoryId), eq(productFaqCategories.productGroupId, id)))
      .returning();

    return NextResponse.json({ category: row });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, categoryId } = await params;

  try {
    const db = await getDb();
    await db
      .delete(productFaqCategories)
      .where(and(eq(productFaqCategories.id, categoryId), eq(productFaqCategories.productGroupId, id)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
