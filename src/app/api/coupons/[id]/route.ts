import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coupons } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const couponUpdateSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Z0-9_-]+$/, "半角英大文字・数字・記号(_-)のみ使用できます(小文字は使用できません)")
    .optional(),
  name: z.string().min(1).optional(),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountValue: z.number().int().min(1).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  minOrderAmount: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  imageUrl: z.string().nullable().optional(),
  promoMessage: z.string().nullable().optional(),
  targetProductIds: z.array(z.string().uuid()).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = couponUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();

    if (input.code !== undefined) {
      const [existing] = await db
        .select({ id: coupons.id })
        .from(coupons)
        .where(and(eq(coupons.code, input.code), ne(coupons.id, id)))
        .limit(1);
      if (existing) {
        return NextResponse.json({ error: `コード「${input.code}」は既に使用されています` }, { status: 409 });
      }
    }

    const [data] = await db
      .update(coupons)
      .set({
        ...(input.code !== undefined && { code: input.code }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.discountType !== undefined && { discountType: input.discountType }),
        ...(input.discountValue !== undefined && { discountValue: input.discountValue }),
        ...(input.startsAt !== undefined && { startsAt: input.startsAt }),
        ...(input.endsAt !== undefined && { endsAt: input.endsAt }),
        ...(input.maxUses !== undefined && { maxUses: input.maxUses }),
        ...(input.minOrderAmount !== undefined && { minOrderAmount: input.minOrderAmount }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.promoMessage !== undefined && { promoMessage: input.promoMessage }),
        ...(input.targetProductIds !== undefined && { targetProductIds: input.targetProductIds }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(coupons.id, id))
      .returning();

    return NextResponse.json({ coupon: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();

    const [coupon] = await db.select({ usedCount: coupons.usedCount }).from(coupons).where(eq(coupons.id, id)).limit(1);
    if (coupon && coupon.usedCount > 0) {
      return NextResponse.json(
        { error: "使用実績のあるクーポンは削除できません。無効化(今すぐ停止)をご利用ください。" },
        { status: 409 },
      );
    }

    await db.delete(coupons).where(eq(coupons.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
