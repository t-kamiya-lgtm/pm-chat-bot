import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductsTable, type ProductRow } from "@/components/admin/ProductsTable";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ productGroupId?: string }>;
}) {
  const { productGroupId } = await searchParams;
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("products")
    .select("*, product_groups(name)")
    .order("smaregi_product_id", { ascending: true, nullsFirst: false });
  if (productGroupId) query = query.eq("product_group_id", productGroupId);
  const { data: products, error: productsError } = await query;

  const [{ data: productGroup }] = await Promise.all([
    productGroupId
      ? supabase.from("product_groups").select("id, name").eq("id", productGroupId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const rows: ProductRow[] = (products ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    shippingFee: product.shipping_fee,
    orderType: product.order_type,
    subscriptionIntervals: product.subscription_intervals ?? [],
    smaregiProductId: product.smaregi_product_id,
    productGroupName: (product.product_groups as { name: string } | null)?.name ?? null,
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
          商品一覧の取得に失敗しました({productsError.message})
        </p>
      )}

      <ProductsTable initialProducts={rows} />
    </div>
  );
}
