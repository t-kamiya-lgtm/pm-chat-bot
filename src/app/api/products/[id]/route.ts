import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productUpdateSchema = z.object({
  productGroupId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  memo: z.string().nullable().optional(),
  price: z.number().int().min(0).optional(),
  listPrice: z.number().int().min(0).nullable().optional(),
  firstTimePrice: z.number().int().min(0).nullable().optional(),
  priceLabel: z.string().nullable().optional(),
  taxRate: z.union([z.literal(8), z.literal(10)]).optional(),
  shippingFee: z.number().int().min(0).optional(),
  isMailDeliverable: z.boolean().optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  smaregiProductId: z.string().optional(),
  orderType: z.enum(["one_time", "subscription"]).optional(),
  subscriptionIntervals: z.array(subscriptionIntervalSchema).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isSet: z.boolean().optional(),
  setItemCount: z.number().int().min(1).nullable().optional(),
  setOptionProductIds: z.array(z.string().uuid()).optional(),
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

  if (input.isSet && input.setOptionProductIds !== undefined) {
    if (!input.setItemCount || input.setOptionProductIds.length === 0) {
      return NextResponse.json(
        { error: "セット品は、セット構成数と、選択肢の商品を1つ以上登録してください" },
        { status: 400 },
      );
    }
  }

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
      ...(input.memo !== undefined && { memo: input.memo }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.listPrice !== undefined && { list_price: input.listPrice }),
      ...(input.firstTimePrice !== undefined && { first_time_price: input.firstTimePrice }),
      ...(input.priceLabel !== undefined && { price_label: input.priceLabel }),
      ...(input.taxRate !== undefined && { tax_rate: input.taxRate }),
      ...(input.shippingFee !== undefined && { shipping_fee: input.shippingFee }),
      ...(input.isMailDeliverable !== undefined && { is_mail_deliverable: input.isMailDeliverable }),
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
      ...(input.isActive !== undefined && { is_active: input.isActive }),
      ...(input.isSet !== undefined && { is_set: input.isSet }),
      ...(input.setItemCount !== undefined && { set_item_count: input.isSet === false ? null : input.setItemCount }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (input.setOptionProductIds !== undefined) {
    const { error: deleteError } = await supabase.from("product_set_options").delete().eq("product_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    if (input.setOptionProductIds.length > 0) {
      const { error: insertError } = await supabase.from("product_set_options").insert(
        input.setOptionProductIds.map((optionProductId, index) => ({
          product_id: id,
          option_product_id: optionProductId,
          display_order: index,
        })),
      );
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ product: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();

  // 注文で使用済みの品番は外部キー制約で削除できない(注文履歴が壊れるため)。
  // 削除前に判定し、アーカイブを促す分かりやすいエラーを返す(でないと削除に失敗しても
  // 画面上は削除できたように見えてしまい、再読み込みで復活したように見える)。
  const [{ count: orderCount }, { count: addonCount }, { count: leadCount }] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("product_id", id),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("addon_product_id", id),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("product_id", id),
  ]);
  if ((orderCount ?? 0) > 0 || (addonCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "この品番は注文で使用されているため削除できません。代わりに「アーカイブ」で一覧から隠せます。" },
      { status: 409 },
    );
  }
  // アクセスログ(leads)が残っている品番も、閲覧履歴の分析データが壊れないよう削除をブロックする。
  // 不要なテストデータの場合は、先にアクセスログ側を削除してから品番を削除する。
  if ((leadCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "この品番は閲覧履歴(アクセスログ)が残っているため削除できません。アクセスログを削除するか、代わりに「アーカイブ」で一覧から隠せます。",
      },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
