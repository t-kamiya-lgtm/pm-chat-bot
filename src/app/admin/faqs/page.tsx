import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FaqReviewList } from "@/components/admin/FaqReviewList";
import type { ProductFaq } from "@/lib/types";

export const dynamic = "force-dynamic";

function mapFaqRow(row: Record<string, unknown>): ProductFaq {
  return {
    id: row.id as string,
    productId: row.product_id as string,
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
  searchParams: Promise<{ productId?: string }>;
}) {
  const { productId } = await searchParams;
  const supabase = createSupabaseAdminClient();

  let query = supabase.from("product_faqs").select("*").order("created_at", { ascending: false });
  if (productId) query = query.eq("product_id", productId);
  const { data } = await query;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">商品QAレビュー</h1>
      <FaqReviewList faqs={(data ?? []).map(mapFaqRow)} />
    </div>
  );
}
