import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { toAdminErrorMessage } from "@/lib/api-error";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 品番の複製。商品コード(旧スマレジ品番)は複製先にもそのまま引き継ぐ
 * (同じ商品コードのまま初回価格だけ変えたオファーパターンをテストできるようにするため。
 * 重複登録を防ぐ制約は廃止済み)。
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data: source, error: sourceError } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (sourceError) return NextResponse.json({ error: toAdminErrorMessage(sourceError.message) }, { status: 500 });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

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
      product_group_id: source.product_group_id,
      display_order: displayOrder,
      name: `${source.name}(コピー)`,
      description: source.description,
      memo: source.memo,
      price: source.price,
      list_price: source.list_price,
      first_time_price: source.first_time_price,
      next_cycle_product_id: source.next_cycle_product_id,
      compare_price_type: source.compare_price_type,
      unit_total_price: source.unit_total_price,
      custom_compare_label: source.custom_compare_label,
      custom_compare_price: source.custom_compare_price,
      price_label: source.price_label,
      tax_rate: source.tax_rate,
      shipping_fee: source.shipping_fee,
      is_mail_deliverable: source.is_mail_deliverable,
      image_url: source.image_url,
      image_urls: source.image_urls,
      smaregi_product_id: source.smaregi_product_id,
      order_type: source.order_type,
      subscription_intervals: source.subscription_intervals,
      is_set: source.is_set,
      set_item_count: source.set_item_count,
      created_by: roleCheck.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: toAdminErrorMessage(error.message) }, { status: 500 });

  if (source.is_set) {
    const { data: sourceOptions } = await supabase
      .from("product_set_options")
      .select("option_product_id, display_order")
      .eq("product_id", id);
    if (sourceOptions && sourceOptions.length > 0) {
      const { error: optionsError } = await supabase.from("product_set_options").insert(
        sourceOptions.map((o) => ({
          product_id: data.id,
          option_product_id: o.option_product_id,
          display_order: o.display_order,
        })),
      );
      if (optionsError) return NextResponse.json({ error: toAdminErrorMessage(optionsError.message) }, { status: 500 });
    }
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
