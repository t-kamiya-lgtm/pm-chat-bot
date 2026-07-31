import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().min(0),
  shippingFee: z.number().int().min(0).default(0),
  imageUrl: z.string().url().optional(),
  smaregiProductId: z.string().optional(),
  isSubscriptionAvailable: z.boolean().default(false),
  subscriptionIntervals: z.array(subscriptionIntervalSchema).default([]),
});

export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
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

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      shipping_fee: input.shippingFee,
      image_url: input.imageUrl ?? null,
      smaregi_product_id: input.smaregiProductId ?? null,
      is_subscription_available: input.isSubscriptionAvailable,
      subscription_intervals: input.subscriptionIntervals,
      created_by: roleCheck.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data }, { status: 201 });
}
