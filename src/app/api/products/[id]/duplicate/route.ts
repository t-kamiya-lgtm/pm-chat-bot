import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 品番の複製。全く同じ商品登録を避けるため、スマレジ品番はダブりチェックのキーとなるので
 * 複製先には引き継がず未設定にする(必要であれば管理画面から新しいIDを登録する)。
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
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
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
      price_label: source.price_label,
      shipping_fee: source.shipping_fee,
      is_mail_deliverable: source.is_mail_deliverable,
      image_url: source.image_url,
      image_urls: source.image_urls,
      smaregi_product_id: null,
      order_type: source.order_type,
      subscription_intervals: source.subscription_intervals,
      created_by: roleCheck.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data }, { status: 201 });
}
