import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productUpdateSchema = z.object({
  productGroupId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().int().min(0).optional(),
  listPrice: z.number().int().min(0).nullable().optional(),
  priceLabel: z.string().nullable().optional(),
  shippingFee: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  smaregiProductId: z.string().optional(),
  orderType: z.enum(["one_time", "subscription"]).optional(),
  subscriptionIntervals: z.array(subscriptionIntervalSchema).optional(),
  displayOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ product: data });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();

  if (input.smaregiProductId) {
    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("id, name")
      .eq("smaregi_product_id", input.smaregiProductId)
      .neq("id", id)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existing) {
      return NextResponse.json(
        { error: `スマレジ品番「${input.smaregiProductId}」は既に「${existing.name}」で使用されています` },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabase
    .from("products")
    .update({
      ...(input.productGroupId !== undefined && { product_group_id: input.productGroupId }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.listPrice !== undefined && { list_price: input.listPrice }),
      ...(input.priceLabel !== undefined && { price_label: input.priceLabel }),
      ...(input.shippingFee !== undefined && { shipping_fee: input.shippingFee }),
      ...(input.imageUrl !== undefined && { image_url: input.imageUrl }),
      ...(input.imageUrls !== undefined && {
        image_urls: input.imageUrls,
        image_url: input.imageUrls[0] ?? null,
      }),
      ...(input.smaregiProductId !== undefined && { smaregi_product_id: input.smaregiProductId }),
      ...(input.orderType !== undefined && { order_type: input.orderType }),
      ...(input.subscriptionIntervals !== undefined && {
        subscription_intervals: input.subscriptionIntervals,
      }),
      ...(input.displayOrder !== undefined && { display_order: input.displayOrder }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
