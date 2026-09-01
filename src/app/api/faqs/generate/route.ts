import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productFaqCategories, productFaqs, productGroups, productSpecs } from "@/db/schema";
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

  try {
    const db = await getDb();

    const [productGroup] = await db
      .select({ name: productGroups.name })
      .from(productGroups)
      .where(eq(productGroups.id, productGroupId))
      .limit(1);
    if (!productGroup) return NextResponse.json({ error: "product group not found" }, { status: 404 });

    const [spec] = await db
      .select()
      .from(productSpecs)
      .where(eq(productSpecs.productGroupId, productGroupId))
      .limit(1);
    if (!spec) {
      return NextResponse.json({ error: "product spec not registered yet" }, { status: 400 });
    }

    const existingCategories = await db
      .select()
      .from(productFaqCategories)
      .where(eq(productFaqCategories.productGroupId, productGroupId))
      .orderBy(asc(productFaqCategories.displayOrder));

    const generator = getProductQaGenerator();
    const candidates = await generator.generateCandidates(
      productGroup.name,
      {
        ingredients: spec.ingredients,
        allergens: spec.allergens,
        volume: spec.volume,
        usage: spec.usage,
        nutrition: spec.nutrition,
        extra: spec.extra as Record<string, unknown>,
      },
      existingCategories.map((c) => c.title),
    );

    if (candidates.length === 0) {
      return NextResponse.json({ faqs: [] });
    }

    const categoryByTitle = new Map<string, string>(existingCategories.map((c) => [c.title, c.id]));
    let nextDisplayOrder = existingCategories.length;

    const faqRows: {
      productGroupId: string;
      categoryId: string;
      question: string;
      answer: string;
      status: string;
      source: string;
      generatedFromSpecId: string;
    }[] = [];

    for (const candidate of candidates) {
      let categoryId = categoryByTitle.get(candidate.category);
      if (!categoryId) {
        const [newCategory] = await db
          .insert(productFaqCategories)
          .values({
            productGroupId,
            title: candidate.category,
            displayOrder: nextDisplayOrder,
          })
          .returning();
        nextDisplayOrder += 1;
        categoryId = newCategory.id;
        categoryByTitle.set(candidate.category, categoryId);
      }

      faqRows.push({
        productGroupId,
        categoryId,
        question: candidate.question,
        answer: candidate.answer,
        status: "draft",
        source: "generated",
        generatedFromSpecId: spec.id,
      });
    }

    const inserted = await db.insert(productFaqs).values(faqRows).returning();
    return NextResponse.json({ faqs: inserted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
