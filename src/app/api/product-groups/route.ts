import { NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroups } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  name: z.string().min(1),
  parentCode: z.string().optional(),
  brandId: z.string().uuid().optional(),
});

/** 商品種類(親品番)一覧。QA・仕様情報はこの単位で管理する。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const rows = await db.query.productGroups.findMany({
      orderBy: desc(productGroups.createdAt),
      with: { brand: { columns: { name: true } } },
    });
    return NextResponse.json({ productGroups: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [row] = await db
      .insert(productGroups)
      .values({
        name: parsed.data.name,
        parentCode: parsed.data.parentCode ?? null,
        brandId: parsed.data.brandId ?? null,
        createdBy: roleCheck.user.id,
      })
      .returning();
    return NextResponse.json({ productGroup: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
