import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "単品",
  subscription: "定期",
};

export default async function AdminProductsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: products } = await supabase
    .from("products")
    .select("*, product_groups(name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">商品(品番)</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/product-groups"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
          >
            商品種類の管理
          </Link>
          <Link
            href="/admin/products/new"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            商品(品番)を登録
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">商品名</th>
              <th className="px-4 py-2">商品種類</th>
              <th className="px-4 py-2">価格</th>
              <th className="px-4 py-2">送料</th>
              <th className="px-4 py-2">注文タイプ</th>
              <th className="px-4 py-2">スマレジ商品ID</th>
            </tr>
          </thead>
          <tbody>
            {products?.map(
              (
                product: {
                  id: string;
                  name: string;
                  price: number;
                  shipping_fee: number;
                  order_type: string;
                  subscription_intervals: string[];
                  smaregi_product_id: string | null;
                  product_groups: { name: string } | null;
                },
              ) => (
                <tr key={product.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <Link href={`/admin/products/${product.id}`} className="text-blue-600 hover:underline">
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{product.product_groups?.name ?? "-"}</td>
                  <td className="px-4 py-2">{product.price.toLocaleString()}円</td>
                  <td className="px-4 py-2">
                    {product.shipping_fee === 0 ? "送料無料" : `${product.shipping_fee.toLocaleString()}円`}
                  </td>
                  <td className="px-4 py-2">
                    {ORDER_TYPE_LABELS[product.order_type]}
                    {product.order_type === "subscription" &&
                      product.subscription_intervals?.length > 0 &&
                      `(${product.subscription_intervals.join(" / ")})`}
                  </td>
                  <td className="px-4 py-2">{product.smaregi_product_id ?? "-"}</td>
                </tr>
              ),
            )}
            {!products?.length && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
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
