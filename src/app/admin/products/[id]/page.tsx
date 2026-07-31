import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductForm } from "@/components/admin/ProductForm";
import { ProductSpecForm } from "@/components/admin/ProductSpecForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const [{ data: product }, { data: spec }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_specs").select("*").eq("product_id", id).maybeSingle(),
  ]);

  if (!product) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        <Link href={`/admin/faqs?productId=${id}`} className="text-sm text-blue-600 hover:underline">
          この商品のQAをレビュー
        </Link>
      </div>

      <ProductForm
        initialValues={{
          id: product.id,
          name: product.name,
          description: product.description ?? "",
          price: product.price,
          shippingFee: product.shipping_fee,
          imageUrl: product.image_url ?? "",
          smaregiProductId: product.smaregi_product_id ?? "",
          isSubscriptionAvailable: product.is_subscription_available,
          subscriptionIntervals: product.subscription_intervals ?? [],
        }}
      />

      <ProductSpecForm
        productId={id}
        initialValues={{
          ingredients: spec?.ingredients ?? "",
          allergens: spec?.allergens ?? "",
          volume: spec?.volume ?? "",
          usage: spec?.usage ?? "",
        }}
      />
    </div>
  );
}
