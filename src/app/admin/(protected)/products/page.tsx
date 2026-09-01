import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroups, products } from "@/db/schema";
import { ProductsTable, type ProductRow } from "@/components/admin/ProductsTable";
import { sanitizeSubscriptionIntervals } from "@/lib/subscription-intervals";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ productGroupId?: string }>;
}) {
  const { productGroupId } = await searchParams;
  const db = await getDb();

  const loadProducts = () =>
    db.query.products.findMany({
      where: productGroupId ? eq(products.productGroupId, productGroupId) : undefined,
      orderBy: asc(products.smaregiProductId),
      with: { productGroup: { columns: { name: true } } },
    });

  let productsError: string | null = null;
  let productList: Awaited<ReturnType<typeof loadProducts>> = [];
  try {
    productList = await loadProducts();
  } catch (err) {
    productsError = String(err);
  }

  const productGroup = productGroupId
    ? (await db
        .select({ id: productGroups.id, name: productGroups.name })
        .from(productGroups)
        .where(eq(productGroups.id, productGroupId))
        .limit(1))[0] ?? null
    : null;

  const rows: ProductRow[] = productList.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    firstTimePrice: product.firstTimePrice,
    shippingFee: product.shippingFee,
    orderType: product.orderType,
    subscriptionIntervals: sanitizeSubscriptionIntervals(product.subscriptionIntervals),
    smaregiProductId: product.smaregiProductId,
    productGroupName: product.productGroup?.name ?? null,
    isActive: product.isActive ?? true,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">商品(品番)</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/product-groups"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            アイテムの管理
          </Link>
          <Link
            href={productGroupId ? `/admin/products/new?productGroupId=${productGroupId}` : "/admin/products/new"}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            商品(品番)を登録
          </Link>
        </div>
      </div>

      {productGroup && (
        <p className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
          「{productGroup.name}」の品番のみ表示しています。{" "}
          <Link href="/admin/products" className="underline">
            すべての品番を表示
          </Link>
        </p>
      )}

      {productsError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          商品一覧の取得に失敗しました({productsError})
        </p>
      )}

      <ProductsTable initialProducts={rows} />
    </div>
  );
}
