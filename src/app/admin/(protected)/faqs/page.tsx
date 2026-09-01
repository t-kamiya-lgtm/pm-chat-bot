import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productFaqCategories, productFaqs, productGroups } from "@/db/schema";
import { FaqReviewList } from "@/components/admin/FaqReviewList";
import { NewFaqForm } from "@/components/admin/NewFaqForm";
import type { ProductFaq } from "@/lib/types";

export const dynamic = "force-dynamic";

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

export default async function AdminFaqsPage({
  searchParams,
}: {
  searchParams: Promise<{ productGroupId?: string }>;
}) {
  const { productGroupId } = await searchParams;
  const db = await getDb();

  if (!productGroupId) {
    const [productGroupRows, allFaqs] = await Promise.all([
      db.select({ id: productGroups.id, name: productGroups.name }).from(productGroups).orderBy(asc(productGroups.name)),
      db.select({ productGroupId: productFaqs.productGroupId, status: productFaqs.status }).from(productFaqs),
    ]);

    const countsByGroup = new Map<string, { total: number; draft: number }>();
    for (const faq of allFaqs) {
      const groupId = faq.productGroupId;
      if (!groupId) continue;
      const current = countsByGroup.get(groupId) ?? { total: 0, draft: 0 };
      current.total += 1;
      if (faq.status === "draft") current.draft += 1;
      countsByGroup.set(groupId, current);
    }

    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">商品QAレビュー</h1>
        <p className="mb-4 text-sm text-neutral-500">
          アイテムを選択すると、そのアイテムのQA内容を表示・編集できます。
        </p>
        <div className="space-y-2">
          {productGroupRows.map((group) => {
            const counts = countsByGroup.get(group.id) ?? { total: 0, draft: 0 };
            return (
              <Link
                key={group.id}
                href={`/admin/faqs?productGroupId=${group.id}`}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-sm"
              >
                <span>{group.name}</span>
                <span className="text-xs text-neutral-500">
                  {counts.total}件
                  {counts.draft > 0 && (
                    <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                      レビュー待ち {counts.draft}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
          {!productGroupRows.length && (
            <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
              アイテムが登録されていません
            </p>
          )}
        </div>
      </div>
    );
  }

  const [[productGroup], faqs, categories] = await Promise.all([
    db.select({ id: productGroups.id, name: productGroups.name }).from(productGroups).where(eq(productGroups.id, productGroupId)).limit(1),
    db.query.productFaqs.findMany({
      where: eq(productFaqs.productGroupId, productGroupId),
      orderBy: desc(productFaqs.createdAt),
      with: { productFaqCategory: { columns: { title: true } } },
    }),
    db
      .select({ id: productFaqCategories.id, title: productFaqCategories.title })
      .from(productFaqCategories)
      .where(eq(productFaqCategories.productGroupId, productGroupId))
      .orderBy(asc(productFaqCategories.displayOrder)),
  ]);

  return (
    <div>
      <Link href="/admin/faqs" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        ← アイテム一覧に戻る
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">
        {productGroup?.name ?? "商品QAレビュー"}
      </h1>
      <div className="mb-4">
        <NewFaqForm productGroupId={productGroupId} categories={categories} />
      </div>
      <FaqReviewList faqs={faqs.map(mapFaqRow)} categories={categories} />
    </div>
  );
}
