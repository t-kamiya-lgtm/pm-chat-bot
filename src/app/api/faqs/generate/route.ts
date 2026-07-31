import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { getProductQaGenerator } from "@/lib/adapters/product-qa-generator";

const requestSchema = z.object({ productId: z.string().uuid() });

/**
 * 商品の仕様情報からQ&A候補をLLMでバッチ生成し、draft状態でproduct_faqsに保存する。
 * 管理画面でのレビュー(承認/修正/却下)を経てpublishedにするまでチャットには表示されない。
 */
export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { productId } = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId)
    .maybeSingle();
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });

  const { data: spec, error: specError } = await supabase
    .from("product_specs")
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();
  if (specError) return NextResponse.json({ error: specError.message }, { status: 500 });
  if (!spec) {
    return NextResponse.json(
      { error: "product spec not registered yet" },
      { status: 400 },
    );
  }

  const generator = getProductQaGenerator();
  const candidates = await generator.generateCandidates(product.name, {
    ingredients: spec.ingredients,
    allergens: spec.allergens,
    volume: spec.volume,
    usage: spec.usage,
    extra: spec.extra,
  });

  if (candidates.length === 0) {
    return NextResponse.json({ faqs: [] });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("product_faqs")
    .insert(
      candidates.map((c) => ({
        product_id: productId,
        question: c.question,
        answer: c.answer,
        status: "draft",
        source: "generated",
        generated_from_spec_id: spec.id,
      })),
    )
    .select("*");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ faqs: inserted });
}
