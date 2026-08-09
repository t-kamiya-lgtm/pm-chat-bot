"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "単品",
  subscription: "定期",
};

export interface ProductRow {
  id: string;
  name: string;
  price: number;
  shippingFee: number;
  orderType: string;
  subscriptionIntervals: string[];
  smaregiProductId: string | null;
  productGroupName: string | null;
}

export function ProductsTable({ initialProducts }: { initialProducts: ProductRow[] }) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.productGroupName ?? "").toLowerCase().includes(q);
  });

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？この操作は取り消せません。`)) return;
    setPending(id);
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setPending(null);
    router.refresh();
  }

  async function handleDuplicate(product: ProductRow) {
    setPending(product.id);
    const res = await fetch(`/api/products/${product.id}/duplicate`, { method: "POST" });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPending(null);
      setToast({ message: `複製に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }

    const body: {
      product: {
        id: string;
        name: string;
        price: number;
        shipping_fee: number;
        order_type: string;
        subscription_intervals: string[];
        smaregi_product_id: string | null;
      };
    } = await res.json();
    const created = body.product;

    setProducts((prev) => [
      ...prev,
      {
        id: created.id,
        name: created.name,
        price: created.price,
        shippingFee: created.shipping_fee,
        orderType: created.order_type,
        subscriptionIntervals: created.subscription_intervals,
        smaregiProductId: created.smaregi_product_id,
        productGroupName: product.productGroupName,
      },
    ]);
    setPending(null);
    setToast({ message: `「${product.name}」を複製しました`, type: "success" });
    router.refresh();
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="商品名・アイテムで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">スマレジ商品ID</th>
              <th className="px-4 py-2">商品名</th>
              <th className="px-4 py-2">アイテム</th>
              <th className="px-4 py-2">価格</th>
              <th className="px-4 py-2">送料</th>
              <th className="px-4 py-2">注文タイプ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{product.smaregiProductId ?? "-"}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/products/${product.id}`} className="text-blue-600 hover:underline">
                    {product.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{product.productGroupName ?? "-"}</td>
                <td className="px-4 py-2">{product.price.toLocaleString()}円</td>
                <td className="px-4 py-2">
                  {product.shippingFee === 0 ? "送料無料" : `${product.shippingFee.toLocaleString()}円`}
                </td>
                <td className="px-4 py-2">
                  {ORDER_TYPE_LABELS[product.orderType]}
                  {product.orderType === "subscription" &&
                    product.subscriptionIntervals?.length > 0 &&
                    `(${product.subscriptionIntervals.join(" / ")})`}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => handleDuplicate(product)}
                    className="mr-3 text-xs text-blue-600 hover:underline disabled:opacity-30"
                  >
                    複製
                  </button>
                  <button
                    type="button"
                    disabled={pending === product.id}
                    onClick={() => handleDelete(product.id, product.name)}
                    className="text-xs text-red-600 hover:underline disabled:opacity-30"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                  {products.length === 0 ? "商品が登録されていません" : "該当する商品がありません"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
