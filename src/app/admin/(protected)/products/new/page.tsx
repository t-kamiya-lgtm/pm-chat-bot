import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ productGroupId?: string }>;
}) {
  const { productGroupId } = await searchParams;
  const supabase = createSupabaseAdminClient();
  const [{ data: productGroups }, { data: otherProducts }] = await Promise.all([
    supabase.from("product_groups").select("id, name").order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id, name")
      .eq("is_set", false)
      .order("smaregi_product_id", { ascending: true, nullsFirst: false }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">商品(品番)を登録</h1>
      <ProductForm
        productGroups={productGroups ?? []}
        otherProducts={otherProducts ?? []}
        lockProductGroup={Boolean(productGroupId)}
        initialValues={
          productGroupId
            ? {
                productGroupId,
                name: "",
                description: "",
                memo: "",
                price: 0,
                listPrice: null,
                priceLabel: "",
                taxRate: 8,
                shippingFee: 0,
                isMailDeliverable: false,
                imageUrls: [],
                smaregiProductId: "",
                orderType: "one_time",
                subscriptionIntervals: [],
                isSet: false,
                setItemCount: null,
                setOptionProductIds: [],
              }
            : undefined
        }
      />
    </div>
  );
}
