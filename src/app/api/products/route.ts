import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { toAdminErrorMessage } from "@/lib/api-error";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productInputSchema = z.object({
  productGroupId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  memo: z.string().nullable().optional(),
  price: z.number().int().min(0),
  listPrice: z.number().int().min(0).nullable().optional(),
  firstTimePrice: z.number().int().min(0).nullable().optional(),
  nextCycleProductId: z.string().uuid().nullable().optional(),
  nextCycleInterval: subscriptionIntervalSchema.nullable().optional(),
  comparePriceType: z.enum(["none", "list_price", "unit_total", "custom"]).default("none"),
  unitTotalPrice: z.number().int().min(0).nullable().optional(),
  customCompareLabel: z.string().nullable().optional(),
  customComparePrice: z.number().int().min(0).nullable().optional(),
  priceLabel: z.string().nullable().optional(),
  taxRate: z.union([z.literal(8), z.literal(10)]).default(8),
  shippingFee: z.number().int().min(0).default(0),
  costAmount: z.number().int().min(0).default(0),
  bundleInsertCost: z.number().int().min(0).default(0),
  shippingCost: z.number().int().min(0).default(0),
  salesCommissionAmount: z.number().int().min(0).default(0),
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
  if (error) return NextResponse.json({ error: toAdminErrorMessage(error.message) }, { status: 500 });
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
  if (input.isSet && (!input.setItemCount || input.setOptionProductIds.length === 0)) {
    return NextResponse.json(
      { error: "より取り品番は、セット構成数と、選択肢の商品を1つ以上登録してください" },
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
      memo: input.memo ?? null,
      price: input.price,
      list_price: input.listPrice ?? null,
      first_time_price: input.orderType === "subscription" ? (input.firstTimePrice ?? null) : null,
      next_cycle_product_id: input.orderType === "subscription" ? (input.nextCycleProductId ?? null) : null,
      next_cycle_interval: input.orderType === "subscription" ? (input.nextCycleInterval ?? null) : null,
      compare_price_type: input.comparePriceType,
      unit_total_price: input.unitTotalPrice ?? null,
      custom_compare_label: input.customCompareLabel ?? null,
      custom_compare_price: input.customComparePrice ?? null,
      price_label: input.priceLabel ?? null,
      tax_rate: input.taxRate,
      shipping_fee: input.shippingFee,
      cost_amount: input.costAmount,
      bundle_insert_cost: input.bundleInsertCost,
      shipping_cost: input.shippingCost,
      sales_commission_amount: input.salesCommissionAmount,
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

  if (error) return NextResponse.json({ error: toAdminErrorMessage(error.message) }, { status: 500 });

  if (input.isSet && input.setOptionProductIds.length > 0) {
    const { error: optionsError } = await supabase.from("product_set_options").insert(
      input.setOptionProductIds.map((optionProductId, index) => ({
        product_id: data.id,
        option_product_id: optionProductId,
        display_order: index,
      })),
    );
    if (optionsError) return NextResponse.json({ error: toAdminErrorMessage(optionsError.message) }, { status: 500 });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
