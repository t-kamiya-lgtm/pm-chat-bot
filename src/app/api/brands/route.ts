import { NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brands } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  name: z.string().min(1),
  // ダッシュボードのブランド別集計用。シナリオコード(英字2文字+数字4桁)の先頭2文字と突き合わせる。
  code: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "英字2文字で入力してください(例: PM)")
    .transform((v) => v.toUpperCase())
    .nullable()
    .optional(),
});

/** ブランド一覧。商品種類(親品番)の一段上の階層。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const rows = await db.select().from(brands).orderBy(desc(brands.createdAt));
    return NextResponse.json({ brands: rows });
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
      .insert(brands)
      .values({ name: parsed.data.name, code: parsed.data.code ?? null })
      .returning();
    return NextResponse.json({ brand: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
