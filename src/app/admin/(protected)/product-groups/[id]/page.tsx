import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brands, productFaqCategories, productFaqs, productGroups, productSpecs, products } from "@/db/schema";
import { ProductSpecForm } from "@/components/admin/ProductSpecForm";
import { FaqCategoryManager } from "@/components/admin/FaqCategoryManager";
import { FaqReviewList } from "@/components/admin/FaqReviewList";
import { NewFaqForm } from "@/components/admin/NewFaqForm";
import { ProductGroupBrandSelect } from "@/components/admin/ProductGroupBrandSelect";
import type { ProductFaq, ProductFaqCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "単品",
  subscription: "定期",
};

function mapCategoryRow(row: { id: string; productGroupId: string; title: string; displayOrder: number; createdAt: string }): ProductFaqCategory {
  return {
    id: row.id,
    productGroupId: row.productGroupId,
    title: row.title,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt,
  };
}

function mapFaqRow(row: {
  id: string;
  productGroupId: string | null;
  categoryId: string | null;
  productFaqCategory: { title: string } | null;
  question: string;
  answer: string;
  status: string;
  source: string;
  generatedFromSpecId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}): ProductFaq & { categoryTitle: string | null } {
  return {
    id: row.id,
    productGroupId: row.productGroupId as string,
    categoryId: row.categoryId,
    categoryTitle: row.productFaqCategory?.title ?? null,
    question: row.question,
    answer: row.answer,
    status: row.status as ProductFaq["status"],
    source: row.source as ProductFaq["source"],
    generatedFromSpecId: row.generatedFromSpecId,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
  };
}

export default async function ProductGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();

  const [[productGroup], productRows, [spec], categories, faqs, brandRows] = await Promise.all([
    db.select().from(productGroups).where(eq(productGroups.id, id)).limit(1),
    db.select().from(products).where(eq(products.productGroupId, id)).orderBy(asc(products.createdAt)),
    db.select().from(productSpecs).where(eq(productSpecs.productGroupId, id)).limit(1),
    db
      .select()
      .from(productFaqCategories)
      .where(eq(productFaqCategories.productGroupId, id))
      .orderBy(asc(productFaqCategories.displayOrder)),
    db.query.productFaqs.findMany({
      where: eq(productFaqs.productGroupId, id),
      orderBy: desc(productFaqs.createdAt),
      with: { productFaqCategory: { columns: { title: true } } },
    }),
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
  ]);

  if (!productGroup) notFound();

  const categoryOptions = categories.map((c) => ({ id: c.id, title: c.title }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{productGroup.name}</h1>
        <Link href="/admin/faqs" className="text-sm text-blue-600 hover:underline">
          全商品のQA一覧を見る
        </Link>
      </div>

      <section className="mb-8">
        <ProductGroupBrandSelect
          productGroupId={id}
          brands={brandRows}
          initialBrandId={productGroup.brandId}
        />
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">品番(単品・定期)一覧</h2>
          <div className="flex gap-2">
            <Link
              href={`/admin/products?productGroupId=${id}`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              品番一覧を開く
            </Link>
            <Link
              href={`/admin/products/new?productGroupId=${id}`}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              品番を追加
            </Link>
          </div>
        </div>
        <div className="space-y-2">
          {productRows.map((product) => (
            <Link
              key={product.id}
              href={`/admin/products/${product.id}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 hover:shadow-sm"
            >
              <span>{product.name}</span>
              <span className="text-xs text-neutral-500">
                {ORDER_TYPE_LABELS[product.orderType]} ・ {product.price.toLocaleString()}円
              </span>
            </Link>
          ))}
          {!productRows.length && (
            <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">
              品番が登録されていません
            </p>
          )}
        </div>
      </section>

      <section className="mb-8">
        <ProductSpecForm
          productGroupId={id}
          initialValues={{
            ingredients: spec?.ingredients ?? "",
            allergens: spec?.allergens ?? "",
            volume: spec?.volume ?? "",
            usage: spec?.usage ?? "",
            nutrition: spec?.nutrition ?? "",
          }}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">QAカテゴリ</h2>
        <FaqCategoryManager productGroupId={id} categories={categories.map(mapCategoryRow)} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">商品QA</h2>
        <div className="mb-4">
          <NewFaqForm productGroupId={id} categories={categoryOptions} />
        </div>
        <FaqReviewList faqs={faqs.map(mapFaqRow)} categories={categoryOptions} />
      </section>
    </div>
  );
}
