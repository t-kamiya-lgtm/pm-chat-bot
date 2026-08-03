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

  const [{ data: product }, { data: productGroups }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_groups").select("id, name").order("created_at", { ascending: false }),
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
            この商品種類の仕様・QAを管理
          </Link>
        )}
      </div>

      <ProductForm
        productGroups={productGroups ?? []}
        initialValues={{
          id: product.id,
          productGroupId: product.product_group_id ?? "",
          name: product.name,
          description: product.description ?? "",
          price: product.price,
          listPrice: product.list_price ?? null,
          priceLabel: product.price_label ?? "",
          shippingFee: product.shipping_fee,
          imageUrl: product.image_url ?? "",
          smaregiProductId: product.smaregi_product_id ?? "",
          orderType: product.order_type,
          subscriptionIntervals: product.subscription_intervals ?? [],
        }}
      />
    </div>
  );
}
