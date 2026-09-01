import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coupons } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 手入力コード(manual_code)クーポンの複製。
 * コードは一意制約があるため引き継がず、末尾に連番を付けて発行し、
 * 管理者が編集画面で正式なコードに変更することを想定する。
 * 使用数・有効状態はリセットする。
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();

    const [source] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (source.type !== "manual_code") {
      return NextResponse.json({ error: "シナリオ自動適用クーポンは複製できません" }, { status: 400 });
    }

    let code = `${source.code}_COPY`;
    for (let suffix = 2; ; suffix++) {
      const [existing] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, code)).limit(1);
      if (!existing) break;
      code = `${source.code}_COPY${suffix}`;
    }

    const [data] = await db
      .insert(coupons)
      .values({
        type: "manual_code",
        scenarioId: null,
        code,
        name: `${source.name}(コピー)`,
        discountType: source.discountType,
        discountValue: source.discountValue,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        maxUses: source.maxUses,
        minOrderAmount: source.minOrderAmount,
        isActive: true,
      })
      .returning();

    return NextResponse.json({ coupon: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
