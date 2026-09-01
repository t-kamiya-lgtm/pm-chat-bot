import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroupTaxRates } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string; assignmentId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, assignmentId } = await params;

  try {
    const db = await getDb();
    await db
      .delete(productGroupTaxRates)
      .where(and(eq(productGroupTaxRates.id, assignmentId), eq(productGroupTaxRates.productGroupId, id)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
