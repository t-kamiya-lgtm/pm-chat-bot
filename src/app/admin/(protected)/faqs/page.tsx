import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FaqReviewList } from "@/components/admin/FaqReviewList";
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

  let query = supabase
    .from("product_faqs")
    .select("*, product_faq_categories(title)")
    .order("created_at", { ascending: false });
  if (productGroupId) query = query.eq("product_group_id", productGroupId);
  const { data } = await query;

  let categories: { id: string; title: string }[] = [];
  if (productGroupId) {
    const { data: categoryRows } = await supabase
      .from("product_faq_categories")
      .select("id, title")
      .eq("product_group_id", productGroupId)
      .order("display_order", { ascending: true });
    categories = categoryRows ?? [];
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">商品QAレビュー</h1>
      <FaqReviewList faqs={(data ?? []).map(mapFaqRow)} categories={categories} />
    </div>
  );
}
