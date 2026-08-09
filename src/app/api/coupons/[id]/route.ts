import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const couponUpdateSchema = z.object({
  code: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "半角英数字・ハイフン・アンダースコアのみ使用できます")
    .optional(),
  name: z.string().min(1).optional(),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountValue: z.number().int().min(1).optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  minOrderAmount: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
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

  const supabase = createSupabaseAdminClient();

  if (input.code !== undefined) {
    const { data: existing } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", input.code)
      .neq("id", id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: `コード「${input.code}」は既に使用されています` }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("coupons")
    .update({
      ...(input.code !== undefined && { code: input.code }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.discountType !== undefined && { discount_type: input.discountType }),
      ...(input.discountValue !== undefined && { discount_value: input.discountValue }),
      ...(input.startsAt !== undefined && { starts_at: input.startsAt }),
      ...(input.endsAt !== undefined && { ends_at: input.endsAt }),
      ...(input.maxUses !== undefined && { max_uses: input.maxUses }),
      ...(input.minOrderAmount !== undefined && { min_order_amount: input.minOrderAmount }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ coupon: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();

  const { data: coupon, error: fetchError } = await supabase
    .from("coupons")
    .select("used_count")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (coupon && coupon.used_count > 0) {
    return NextResponse.json(
      { error: "使用実績のあるクーポンは削除できません。無効化(今すぐ停止)をご利用ください。" },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("coupons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
