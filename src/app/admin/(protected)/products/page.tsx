import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProductsTable, type ProductRow } from "@/components/admin/ProductsTable";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*, product_groups(name)")
    .order("display_order", { ascending: true });

  const rows: ProductRow[] = (products ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    shippingFee: product.shipping_fee,
    orderType: product.order_type,
    subscriptionIntervals: product.subscription_intervals ?? [],
    smaregiProductId: product.smaregi_product_id,
    displayOrder: product.display_order,
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
            href="/admin/products/new"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            商品(品番)を登録
          </Link>
        </div>
      </div>

      {productsError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          商品一覧の取得に失敗しました({productsError.message})
        </p>
      )}

      <ProductsTable initialProducts={rows} />
    </div>
  );
}
