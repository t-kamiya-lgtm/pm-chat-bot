import { NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { taxRates } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  name: z.string().min(1),
  ratePercent: z.number().min(0).max(100),
});

/** 税率メニュー(例: 標準税率10%、軽減税率8%)の一覧・登録。商品ジャンル×期間で割り当てて使う。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const rows = await db.select().from(taxRates).orderBy(desc(taxRates.rate));
    return NextResponse.json({ taxRates: rows.map((r) => ({ ...r, rate: Number(r.rate) })) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const db = await getDb();
    const [row] = await db
      .insert(taxRates)
      .values({ name: parsed.data.name, rate: String(parsed.data.ratePercent / 100) })
      .returning();
    return NextResponse.json({ taxRate: { ...row, rate: Number(row.rate) } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
