import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ProductRow } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">商品</h1>
        <Link
          href="/admin/products/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          商品を登録
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">商品名</th>
              <th className="px-4 py-2">価格</th>
              <th className="px-4 py-2">送料</th>
              <th className="px-4 py-2">定期購入</th>
              <th className="px-4 py-2">スマレジ商品ID</th>
            </tr>
          </thead>
          <tbody>
            {(products as ProductRow[] | null)?.map((product) => (
              <tr key={product.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/products/${product.id}`} className="text-blue-600 hover:underline">
                    {product.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{product.price.toLocaleString()}円</td>
                <td className="px-4 py-2">
                  {product.shipping_fee === 0 ? "送料無料" : `${product.shipping_fee.toLocaleString()}円`}
                </td>
                <td className="px-4 py-2">
                  {product.is_subscription_available
                    ? product.subscription_intervals.join(" / ")
                    : "-"}
                </td>
                <td className="px-4 py-2">{product.smaregi_product_id ?? "-"}</td>
              </tr>
            ))}
            {!products?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  商品が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
