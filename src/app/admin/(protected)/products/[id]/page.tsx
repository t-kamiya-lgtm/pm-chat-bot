import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroups, productSetOptions, products } from "@/db/schema";
import { ProductForm } from "@/components/admin/ProductForm";
import { sanitizeSubscriptionIntervals } from "@/lib/subscription-intervals";
import type { ComparePriceType, ProductOrderType, SubscriptionInterval } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();

  const [[product], productGroupRows, allProducts, setOptions] = await Promise.all([
    db.select().from(products).where(eq(products.id, id)).limit(1),
    db
      .select({ id: productGroups.id, name: productGroups.name })
      .from(productGroups)
      .orderBy(desc(productGroups.createdAt)),
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(ne(products.id, id), eq(products.isSet, false)))
      .orderBy(asc(products.smaregiProductId)),
    db
      .select({ optionProductId: productSetOptions.optionProductId })
      .from(productSetOptions)
      .where(eq(productSetOptions.productId, id)),
  ]);

  if (!product) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{product.name}</h1>
        {product.productGroupId && (
          <Link
            href={`/admin/product-groups/${product.productGroupId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            このアイテムの仕様・QAを管理
          </Link>
        )}
      </div>

      <ProductForm
        productGroups={productGroupRows}
        otherProducts={allProducts}
        initialValues={{
          id: product.id,
          productGroupId: product.productGroupId ?? "",
          name: product.name,
          description: product.description ?? "",
          memo: product.memo ?? "",
          price: product.price,
          listPrice: product.listPrice ?? null,
          firstTimePrice: product.firstTimePrice ?? null,
          nextCycleProductId: product.nextCycleProductId ?? null,
          nextCycleInterval: (product.nextCycleInterval as SubscriptionInterval | null) ?? null,
          comparePriceType: (product.comparePriceType as ComparePriceType) ?? "none",
          unitTotalPrice: product.unitTotalPrice ?? null,
          customCompareLabel: product.customCompareLabel ?? "",
          customComparePrice: product.customComparePrice ?? null,
          priceLabel: product.priceLabel ?? "",
          taxRate: product.taxRate === 10 ? 10 : 8,
          shippingFee: product.shippingFee,
          costAmount: product.costAmount ?? 0,
          bundleInsertCost: product.bundleInsertCost ?? 0,
          shippingCost: product.shippingCost ?? 0,
          salesCommissionAmount: product.salesCommissionAmount ?? 0,
          isMailDeliverable: product.isMailDeliverable ?? false,
          imageUrls: product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [],
          smaregiProductId: product.smaregiProductId ?? "",
          orderType: product.orderType as ProductOrderType,
          subscriptionIntervals: sanitizeSubscriptionIntervals(product.subscriptionIntervals),
          isSet: product.isSet ?? false,
          setItemCount: product.setItemCount ?? null,
          setOptionProductIds: setOptions.map((o) => o.optionProductId),
        }}
      />
    </div>
  );
}
