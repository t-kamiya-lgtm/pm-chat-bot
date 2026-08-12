import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const [{ data: product }, { data: productGroups }, { data: allProducts }, { data: setOptions }] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", id).maybeSingle(),
      supabase.from("product_groups").select("id, name").order("created_at", { ascending: false }),
      supabase
        .from("products")
        .select("id, name")
        .neq("id", id)
        .eq("is_set", false)
        .order("smaregi_product_id", { ascending: true, nullsFirst: false }),
      supabase.from("product_set_options").select("option_product_id").eq("product_id", id),
    ]);

  if (!product) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        {product.product_group_id && (
          <Link
            href={`/admin/product-groups/${product.product_group_id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            このアイテムの仕様・QAを管理
          </Link>
        )}
      </div>

      <ProductForm
        productGroups={productGroups ?? []}
        otherProducts={allProducts ?? []}
        initialValues={{
          id: product.id,
          productGroupId: product.product_group_id ?? "",
          name: product.name,
          description: product.description ?? "",
          memo: product.memo ?? "",
          price: product.price,
          listPrice: product.list_price ?? null,
          priceLabel: product.price_label ?? "",
          taxRate: product.tax_rate === 10 ? 10 : 8,
          shippingFee: product.shipping_fee,
          isMailDeliverable: product.is_mail_deliverable ?? false,
          imageUrls: product.image_urls?.length ? product.image_urls : product.image_url ? [product.image_url] : [],
          smaregiProductId: product.smaregi_product_id ?? "",
          orderType: product.order_type,
          subscriptionIntervals: product.subscription_intervals ?? [],
          isSet: product.is_set ?? false,
          setItemCount: product.set_item_count ?? null,
          setOptionProductIds: (setOptions ?? []).map((o) => o.option_product_id),
        }}
      />
    </div>
  );
}
