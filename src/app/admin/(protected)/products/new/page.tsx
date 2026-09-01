import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroups, products } from "@/db/schema";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ productGroupId?: string }>;
}) {
  const { productGroupId } = await searchParams;
  const db = await getDb();
  const [productGroupRows, otherProductRows] = await Promise.all([
    db
      .select({ id: productGroups.id, name: productGroups.name })
      .from(productGroups)
      .orderBy(desc(productGroups.createdAt)),
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.isSet, false))
      .orderBy(asc(products.smaregiProductId)),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">商品(品番)を登録</h1>
      <ProductForm
        productGroups={productGroupRows}
        otherProducts={otherProductRows}
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
                firstTimePrice: null,
                nextCycleProductId: null,
                nextCycleInterval: null,
                comparePriceType: "none",
                unitTotalPrice: null,
                customCompareLabel: "",
                customComparePrice: null,
                priceLabel: "",
                taxRate: 8,
                shippingFee: 0,
                costAmount: 0,
                bundleInsertCost: 0,
                shippingCost: 0,
                salesCommissionAmount: 0,
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
