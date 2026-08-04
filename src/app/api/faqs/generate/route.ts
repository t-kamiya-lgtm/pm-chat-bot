import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { getProductQaGenerator } from "@/lib/adapters/product-qa-generator";

const requestSchema = z.object({ productGroupId: z.string().uuid() });

/**
 * 商品種類(親品番)の仕様情報からQ&A候補をLLMでカテゴリ分けしつつバッチ生成し、
 * draft状態でproduct_faqsに保存する。既存カテゴリに合致すればそこに紐付け、
 * 新しいカテゴリが必要な場合は自動作成する。
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
  const { productGroupId } = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data: productGroup, error: groupError } = await supabase
    .from("product_groups")
    .select("name")
    .eq("id", productGroupId)
    .maybeSingle();
  if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 });
  if (!productGroup) return NextResponse.json({ error: "product group not found" }, { status: 404 });

  const { data: spec, error: specError } = await supabase
    .from("product_specs")
    .select("*")
    .eq("product_group_id", productGroupId)
    .maybeSingle();
  if (specError) return NextResponse.json({ error: specError.message }, { status: 500 });
  if (!spec) {
    return NextResponse.json({ error: "product spec not registered yet" }, { status: 400 });
  }

  const { data: existingCategories, error: categoriesError } = await supabase
    .from("product_faq_categories")
    .select("*")
    .eq("product_group_id", productGroupId)
    .order("display_order", { ascending: true });
  if (categoriesError) return NextResponse.json({ error: categoriesError.message }, { status: 500 });

  const generator = getProductQaGenerator();
  const candidates = await generator.generateCandidates(
    productGroup.name,
    {
      ingredients: spec.ingredients,
      allergens: spec.allergens,
      volume: spec.volume,
      usage: spec.usage,
      nutrition: spec.nutrition,
      extra: spec.extra,
    },
    (existingCategories ?? []).map((c) => c.title),
  );

  if (candidates.length === 0) {
    return NextResponse.json({ faqs: [] });
  }

  const categoryByTitle = new Map<string, string>(
    (existingCategories ?? []).map((c) => [c.title, c.id as string]),
  );
  let nextDisplayOrder = (existingCategories ?? []).length;

  const faqRows: {
    product_group_id: string;
    category_id: string;
    question: string;
    answer: string;
    status: string;
    source: string;
    generated_from_spec_id: string;
  }[] = [];

  for (const candidate of candidates) {
    let categoryId = categoryByTitle.get(candidate.category);
    if (!categoryId) {
      const { data: newCategory, error: createCategoryError } = await supabase
        .from("product_faq_categories")
        .insert({
          product_group_id: productGroupId,
          title: candidate.category,
          display_order: nextDisplayOrder,
        })
        .select("*")
        .single();
      if (createCategoryError) {
        return NextResponse.json({ error: createCategoryError.message }, { status: 500 });
      }
      nextDisplayOrder += 1;
      categoryId = newCategory.id as string;
      categoryByTitle.set(candidate.category, categoryId);
    }

    faqRows.push({
      product_group_id: productGroupId,
      category_id: categoryId,
      question: candidate.question,
      answer: candidate.answer,
      status: "draft",
      source: "generated",
      generated_from_spec_id: spec.id,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("product_faqs")
    .insert(faqRows)
    .select("*");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ faqs: inserted });
}
