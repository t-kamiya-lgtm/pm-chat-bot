import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FaqReviewList } from "@/components/admin/FaqReviewList";
import { NewFaqForm } from "@/components/admin/NewFaqForm";
import type { ProductFaq } from "@/lib/types";

export const dynamic = "force-dynamic";

function mapFaqRow(row: Record<string, unknown>): ProductFaq & { categoryTitle: string | null } {
  const category = row.product_faq_categories as { title: string } | null;
  return {
    id: row.id as string,
    productGroupId: row.product_group_id as string,
    categoryId: row.category_id as string | null,
    categoryTitle: category?.title ?? null,
    question: row.question as string,
    answer: row.answer as string,
    status: row.status as ProductFaq["status"],
    source: row.source as ProductFaq["source"],
    generatedFromSpecId: row.generated_from_spec_id as string | null,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    createdAt: row.created_at as string,
  };
}

export default async function AdminFaqsPage({
  searchParams,
}: {
  searchParams: Promise<{ productGroupId?: string }>;
}) {
  const { productGroupId } = await searchParams;
  const supabase = createSupabaseAdminClient();

  if (!productGroupId) {
    const [{ data: productGroups }, { data: allFaqs }] = await Promise.all([
      supabase.from("product_groups").select("id, name").order("name"),
      supabase.from("product_faqs").select("product_group_id, status"),
    ]);

    const countsByGroup = new Map<string, { total: number; draft: number }>();
    for (const faq of allFaqs ?? []) {
      const groupId = faq.product_group_id as string | null;
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
          {(productGroups ?? []).map((group) => {
            const counts = countsByGroup.get(group.id as string) ?? { total: 0, draft: 0 };
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
          {!productGroups?.length && (
            <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
              アイテムが登録されていません
            </p>
          )}
        </div>
      </div>
    );
  }

  const [{ data: productGroup }, { data: faqs }, { data: categoryRows }] = await Promise.all([
    supabase.from("product_groups").select("id, name").eq("id", productGroupId).maybeSingle(),
    supabase
      .from("product_faqs")
      .select("*, product_faq_categories(title)")
      .eq("product_group_id", productGroupId)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_faq_categories")
      .select("id, title")
      .eq("product_group_id", productGroupId)
      .order("display_order", { ascending: true }),
  ]);
  const categories = categoryRows ?? [];

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
      <FaqReviewList faqs={(faqs ?? []).map(mapFaqRow)} categories={categories} />
    </div>
  );
}
