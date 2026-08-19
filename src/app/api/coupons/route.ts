import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const couponInputSchema = z
  .object({
    type: z.enum(["scenario_auto", "manual_code"]),
    scenarioId: z.string().uuid().optional(),
    code: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/, "半角英数字・ハイフン・アンダースコアのみ使用できます")
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

  const supabase = createSupabaseAdminClient();
  let query = supabase.from("coupons").select("*").order("created_at", { ascending: false });
  if (type) query = query.eq("type", type);
  if (scenarioId) query = query.eq("scenario_id", scenarioId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ coupons: data });
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

  const supabase = createSupabaseAdminClient();

  if (input.type === "manual_code" && input.code) {
    const { data: existing } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", input.code)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: `コード「${input.code}」は既に使用されています` }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      type: input.type,
      scenario_id: input.type === "scenario_auto" ? input.scenarioId : null,
      code: input.type === "manual_code" ? input.code : null,
      name: input.name,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      max_uses: input.maxUses ?? null,
      min_order_amount: input.minOrderAmount ?? null,
      is_active: input.isActive ?? true,
      image_url: input.imageUrl ?? null,
      promo_message: input.promoMessage ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ coupon: data }, { status: 201 });
}
