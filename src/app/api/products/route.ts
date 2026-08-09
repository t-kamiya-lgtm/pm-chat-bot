import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productInputSchema = z.object({
  productGroupId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  memo: z.string().nullable().optional(),
  price: z.number().int().min(0),
  listPrice: z.number().int().min(0).nullable().optional(),
  priceLabel: z.string().nullable().optional(),
  shippingFee: z.number().int().min(0).default(0),
  isMailDeliverable: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).default([]),
  smaregiProductId: z.string().optional(),
  orderType: z.enum(["one_time", "subscription"]),
  subscriptionIntervals: z.array(subscriptionIntervalSchema).default([]),
  isSet: z.boolean().default(false),
  setItemCount: z.number().int().min(1).nullable().optional(),
  setOptionProductIds: z.array(z.string().uuid()).default([]),
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
  if (input.isSet && (!input.setItemCount || input.setOptionProductIds.length < input.setItemCount)) {
    return NextResponse.json(
      { error: "セット品は、セット構成数以上の数の選択肢商品を登録してください" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();

  if (input.smaregiProductId) {
    const { data: existing, error: existingError } = await supabase
      .from("products")
      .select("id, name")
      .eq("smaregi_product_id", input.smaregiProductId)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existing) {
      return NextResponse.json(
        { error: `スマレジ品番「${input.smaregiProductId}」は既に「${existing.name}」で使用されています` },
        { status: 409 },
      );
    }
  }

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
      memo: input.memo ?? null,
      price: input.price,
      list_price: input.listPrice ?? null,
      price_label: input.priceLabel ?? null,
      shipping_fee: input.shippingFee,
      is_mail_deliverable: input.isMailDeliverable,
      image_url: input.imageUrls[0] ?? input.imageUrl ?? null,
      image_urls: input.imageUrls,
      smaregi_product_id: input.smaregiProductId ?? null,
      order_type: input.orderType,
      subscription_intervals: input.orderType === "subscription" ? input.subscriptionIntervals : [],
      is_set: input.isSet,
      set_item_count: input.isSet ? input.setItemCount : null,
      created_by: roleCheck.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (input.isSet && input.setOptionProductIds.length > 0) {
    const { error: optionsError } = await supabase.from("product_set_options").insert(
      input.setOptionProductIds.map((optionProductId, index) => ({
        product_id: data.id,
        option_product_id: optionProductId,
        display_order: index,
      })),
    );
    if (optionsError) return NextResponse.json({ error: optionsError.message }, { status: 500 });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
