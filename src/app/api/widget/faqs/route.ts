import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productFaqCategories, productFaqs, products } from "@/db/schema";

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

  try {
    const db = await getDb();

    const [product] = await db
      .select({ productGroupId: products.productGroupId })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product?.productGroupId) {
      return NextResponse.json({ categories: [] });
    }

    const [categories, faqs] = await Promise.all([
      db
        .select({ id: productFaqCategories.id, title: productFaqCategories.title })
        .from(productFaqCategories)
        .where(eq(productFaqCategories.productGroupId, product.productGroupId))
        .orderBy(asc(productFaqCategories.displayOrder)),
      db
        .select({
          id: productFaqs.id,
          categoryId: productFaqs.categoryId,
          question: productFaqs.question,
          answer: productFaqs.answer,
        })
        .from(productFaqs)
        .where(and(eq(productFaqs.productGroupId, product.productGroupId), eq(productFaqs.status, "published")))
        .orderBy(asc(productFaqs.createdAt)),
    ]);

    const result = categories
      .map((category) => ({
        id: category.id,
        title: category.title,
        faqs: faqs.filter((faq) => faq.categoryId === category.id),
      }))
      .filter((category) => category.faqs.length > 0);

    return NextResponse.json({ categories: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
