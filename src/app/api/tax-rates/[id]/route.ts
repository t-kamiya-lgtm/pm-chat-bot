import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroupTaxRates, taxRates } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 使用中(商品ジャンルの期間設定から参照されている)の税率メニューは削除できないようにする
 * (過去の注文のスナップショットには影響しないが、設定の参照整合性のため)。
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const usedIn = await db
      .select({ id: productGroupTaxRates.id })
      .from(productGroupTaxRates)
      .where(eq(productGroupTaxRates.taxRateId, id))
      .limit(1);
    if (usedIn.length > 0) {
      return NextResponse.json({ error: "この税率は商品ジャンルの期間設定で使用中のため削除できません" }, { status: 400 });
    }

    await db.delete(taxRates).where(eq(taxRates.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
