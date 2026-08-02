import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * チャットウィジェット用: 指定商品(品番)が属する商品種類(親品番)の
 * 公開済みFAQを、カテゴリ→質問の階層で返す(認証不要)。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("product_group_id")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  if (!product?.product_group_id) {
    return NextResponse.json({ categories: [] });
  }

  const [{ data: categories, error: categoriesError }, { data: faqs, error: faqsError }] =
    await Promise.all([
      supabase
        .from("product_faq_categories")
        .select("id, title")
        .eq("product_group_id", product.product_group_id)
        .order("display_order", { ascending: true }),
      supabase
        .from("product_faqs")
        .select("id, category_id, question, answer")
        .eq("product_group_id", product.product_group_id)
        .eq("status", "published")
        .order("created_at", { ascending: true }),
    ]);

  if (categoriesError) return NextResponse.json({ error: categoriesError.message }, { status: 500 });
  if (faqsError) return NextResponse.json({ error: faqsError.message }, { status: 500 });

  const result = (categories ?? [])
    .map((category) => ({
      id: category.id,
      title: category.title,
      faqs: (faqs ?? []).filter((faq) => faq.category_id === category.id),
    }))
    .filter((category) => category.faqs.length > 0);

  return NextResponse.json({ categories: result });
}
