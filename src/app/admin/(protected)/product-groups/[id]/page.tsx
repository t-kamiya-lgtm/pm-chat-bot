import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductSpecForm } from "@/components/admin/ProductSpecForm";
import { FaqCategoryManager } from "@/components/admin/FaqCategoryManager";
import type { ProductFaqCategory } from "@/lib/types";

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

export default async function ProductGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const [{ data: productGroup }, { data: products }, { data: spec }, { data: categories }] =
    await Promise.all([
      supabase.from("product_groups").select("*").eq("id", id).maybeSingle(),
      supabase.from("products").select("*").eq("product_group_id", id).order("created_at"),
      supabase.from("product_specs").select("*").eq("product_group_id", id).maybeSingle(),
      supabase
        .from("product_faq_categories")
        .select("*")
        .eq("product_group_id", id)
        .order("display_order", { ascending: true }),
    ]);

  if (!productGroup) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{productGroup.name}</h1>
        <Link
          href={`/admin/faqs?productGroupId=${id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          この商品種類のQAをレビュー
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

      <section>
        <h2 className="mb-3 text-lg font-medium">QAカテゴリ</h2>
        <FaqCategoryManager productGroupId={id} categories={(categories ?? []).map(mapCategoryRow)} />
      </section>
    </div>
  );
}
