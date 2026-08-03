import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductSpecForm } from "@/components/admin/ProductSpecForm";
import { FaqCategoryManager } from "@/components/admin/FaqCategoryManager";
import { FaqReviewList } from "@/components/admin/FaqReviewList";
import { NewFaqForm } from "@/components/admin/NewFaqForm";
import type { ProductFaq, ProductFaqCategory } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "単品",
  subscription: "定期",
};

function mapCategoryRow(row: Record<string, unknown>): ProductFaqCategory {
  return {
    id: row.id as string,
    productGroupId: row.product_group_id as string,
    title: row.title as string,
    displayOrder: row.display_order as number,
    createdAt: row.created_at as string,
  };
}

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

export default async function ProductGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const [{ data: productGroup }, { data: products }, { data: spec }, { data: categories }, { data: faqs }] =
    await Promise.all([
      supabase.from("product_groups").select("*").eq("id", id).maybeSingle(),
      supabase.from("products").select("*").eq("product_group_id", id).order("created_at"),
      supabase.from("product_specs").select("*").eq("product_group_id", id).maybeSingle(),
      supabase
        .from("product_faq_categories")
        .select("*")
        .eq("product_group_id", id)
        .order("display_order", { ascending: true }),
      supabase
        .from("product_faqs")
        .select("*, product_faq_categories(title)")
        .eq("product_group_id", id)
        .order("created_at", { ascending: false }),
    ]);

  if (!productGroup) notFound();

  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id as string, title: c.title as string }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{productGroup.name}</h1>
        <Link href="/admin/faqs" className="text-sm text-blue-600 hover:underline">
          全商品のQA一覧を見る
        </Link>
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">品番(単品・定期)一覧</h2>
          <Link
            href={`/admin/products/new?productGroupId=${id}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            品番を追加
          </Link>
        </div>
        <div className="space-y-2">
          {products?.map((product) => (
            <Link
              key={product.id}
              href={`/admin/products/${product.id}`}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 hover:shadow-sm"
            >
              <span>{product.name}</span>
              <span className="text-xs text-neutral-500">
                {ORDER_TYPE_LABELS[product.order_type]} ・ {product.price.toLocaleString()}円
              </span>
            </Link>
          ))}
          {!products?.length && (
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
          }}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">QAカテゴリ</h2>
        <FaqCategoryManager productGroupId={id} categories={(categories ?? []).map(mapCategoryRow)} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">商品QA</h2>
        <div className="mb-4">
          <NewFaqForm productGroupId={id} categories={categoryOptions} />
        </div>
        <FaqReviewList faqs={(faqs ?? []).map(mapFaqRow)} categories={categoryOptions} />
      </section>
    </div>
  );
}
