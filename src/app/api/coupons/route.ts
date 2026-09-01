import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coupons } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const couponInputSchema = z
  .object({
    type: z.enum(["scenario_auto", "manual_code"]),
    scenarioId: z.string().uuid().optional(),
    code: z
      .string()
      .regex(/^[A-Z0-9_-]+$/, "半角英大文字・数字・記号(_-)のみ使用できます(小文字は使用できません)")
      .optional(),
    name: z.string().min(1),
    discountType: z.enum(["percent", "fixed"]),
    discountValue: z.number().int().min(1),
    startsAt: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    minOrderAmount: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().optional(),
    imageUrl: z.string().nullable().optional(),
    promoMessage: z.string().nullable().optional(),
    targetProductIds: z.array(z.string().uuid()).nullable().optional(),
  })
  .refine((v) => (v.type === "scenario_auto" ? Boolean(v.scenarioId) : true), {
    message: "scenarioId is required for scenario_auto coupons",
    path: ["scenarioId"],
  })
  .refine((v) => (v.type === "manual_code" ? Boolean(v.code) : true), {
    message: "code is required for manual_code coupons",
    path: ["code"],
  });

export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const scenarioId = searchParams.get("scenarioId");

  try {
    const db = await getDb();
    const conditions = [];
    if (type) conditions.push(eq(coupons.type, type));
    if (scenarioId) conditions.push(eq(coupons.scenarioId, scenarioId));

    const data = await db
      .select()
      .from(coupons)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(coupons.createdAt));
    return NextResponse.json({ coupons: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = couponInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const db = await getDb();

    if (input.type === "manual_code" && input.code) {
      const [existing] = await db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, input.code)).limit(1);
      if (existing) {
        return NextResponse.json({ error: `コード「${input.code}」は既に使用されています` }, { status: 409 });
      }
    }

    const [data] = await db
      .insert(coupons)
      .values({
        type: input.type,
        scenarioId: input.type === "scenario_auto" ? input.scenarioId : null,
        code: input.type === "manual_code" ? input.code : null,
        name: input.name,
        discountType: input.discountType,
        discountValue: input.discountValue,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        maxUses: input.maxUses ?? null,
        minOrderAmount: input.minOrderAmount ?? null,
        isActive: input.isActive ?? true,
        imageUrl: input.imageUrl ?? null,
        promoMessage: input.promoMessage ?? null,
        targetProductIds: input.targetProductIds ?? null,
      })
      .returning();

    return NextResponse.json({ coupon: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
