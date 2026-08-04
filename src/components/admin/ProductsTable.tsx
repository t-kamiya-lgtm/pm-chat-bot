"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  displayOrder: number;
  productGroupName: string | null;
}

export function ProductsTable({ initialProducts }: { initialProducts: ProductRow[] }) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.productGroupName ?? "").toLowerCase().includes(q);
  });

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= products.length) return;

    const current = products[index];
    const target = products[targetIndex];
    const next = [...products];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setProducts(next);

    setPending(current.id);
    await Promise.all([
      fetch(`/api/products/${current.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: target.displayOrder }),
      }),
      fetch(`/api/products/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: current.displayOrder }),
      }),
    ]);
    setPending(null);
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`「${name}」を削除しますか？この操作は取り消せません。`)) return;
    setPending(id);
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setPending(null);
    router.refresh();
  }

  return (
    <div>
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
              <th className="px-4 py-2">並び順</th>
              <th className="px-4 py-2">商品名</th>
              <th className="px-4 py-2">アイテム</th>
              <th className="px-4 py-2">価格</th>
              <th className="px-4 py-2">送料</th>
              <th className="px-4 py-2">注文タイプ</th>
              <th className="px-4 py-2">スマレジ商品ID</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => {
              const index = products.indexOf(product);
              return (
                <tr key={product.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={pending !== null || index === 0 || search.trim() !== ""}
                        onClick={() => move(index, -1)}
                        className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={pending !== null || index === products.length - 1 || search.trim() !== ""}
                        onClick={() => move(index, 1)}
                        className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
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
                  <td className="px-4 py-2">{product.smaregiProductId ?? "-"}</td>
                  <td className="px-4 py-2 text-right">
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
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  {products.length === 0 ? "商品が登録されていません" : "該当する商品がありません"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {search.trim() !== "" && (
        <p className="mt-2 text-xs text-neutral-400">
          検索中は並び替えできません。並び替えるには検索欄を空にしてください。
        </p>
      )}
    </div>
  );
}
