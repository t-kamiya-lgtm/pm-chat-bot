import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroupTaxRates, taxRates } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  taxRateId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 商品ジャンル(アイテム)ごとの税率適用期間の一覧・登録。 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const [assignmentRows, taxRateRows] = await Promise.all([
      db
        .select()
        .from(productGroupTaxRates)
        .where(eq(productGroupTaxRates.productGroupId, id))
        .orderBy(desc(productGroupTaxRates.periodStart)),
      db.select({ id: taxRates.id, name: taxRates.name, rate: taxRates.rate }).from(taxRates),
    ]);

    const taxRateById = new Map(taxRateRows.map((t) => [t.id, t]));
    const assignments = assignmentRows.map((a) => {
      const taxRate = taxRateById.get(a.taxRateId) ?? null;
      return {
        id: a.id,
        tax_rate_id: a.taxRateId,
        period_start: a.periodStart,
        period_end: a.periodEnd,
        tax_rates: taxRate ? { id: taxRate.id, name: taxRate.name, rate: Number(taxRate.rate) } : null,
      };
    });

    return NextResponse.json({ assignments });
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
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const periodEnd = parsed.data.periodEnd ?? null;
  if (periodEnd && parsed.data.periodStart > periodEnd) {
    return NextResponse.json({ error: "開始日は終了日より前に指定してください" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [row] = await db
      .insert(productGroupTaxRates)
      .values({
        productGroupId: id,
        taxRateId: parsed.data.taxRateId,
        periodStart: parsed.data.periodStart,
        periodEnd,
      })
      .returning();
    return NextResponse.json({ assignment: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
