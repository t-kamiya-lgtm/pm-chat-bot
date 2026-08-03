import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productInputSchema = z.object({
  productGroupId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().min(0),
  listPrice: z.number().int().min(0).nullable().optional(),
  priceLabel: z.string().nullable().optional(),
  shippingFee: z.number().int().min(0).default(0),
  imageUrl: z.string().url().optional(),
  smaregiProductId: z.string().optional(),
  orderType: z.enum(["one_time", "subscription"]),
  subscriptionIntervals: z.array(subscriptionIntervalSchema).default([]),
});

export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const productGroupId = searchParams.get("productGroupId");

  const supabase = createSupabaseAdminClient();
  let query = supabase.from("products").select("*").order("display_order", { ascending: true });
  if (productGroupId) query = query.eq("product_group_id", productGroupId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (input.orderType === "subscription" && input.subscriptionIntervals.length === 0) {
    return NextResponse.json(
      { error: "subscriptionIntervals is required when orderType is subscription" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: lastProduct } = await supabase
    .from("products")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = (lastProduct?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("products")
    .insert({
      product_group_id: input.productGroupId,
      display_order: displayOrder,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      list_price: input.listPrice ?? null,
      price_label: input.priceLabel ?? null,
      shipping_fee: input.shippingFee,
      image_url: input.imageUrl ?? null,
      smaregi_product_id: input.smaregiProductId ?? null,
      order_type: input.orderType,
      subscription_intervals: input.orderType === "subscription" ? input.subscriptionIntervals : [],
      created_by: roleCheck.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data }, { status: 201 });
}
