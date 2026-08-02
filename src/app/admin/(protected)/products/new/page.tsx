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
  const { data: productGroups } = await supabase
    .from("product_groups")
    .select("id, name")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">商品(品番)を登録</h1>
      <ProductForm
        productGroups={productGroups ?? []}
        lockProductGroup={Boolean(productGroupId)}
        initialValues={
          productGroupId
            ? {
                productGroupId,
                name: "",
                description: "",
                price: 0,
                shippingFee: 0,
                imageUrl: "",
                smaregiProductId: "",
                orderType: "one_time",
                subscriptionIntervals: [],
              }
            : undefined
        }
      />
    </div>
  );
}
