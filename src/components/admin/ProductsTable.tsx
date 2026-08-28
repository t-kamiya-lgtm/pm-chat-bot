"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

const ORDER_TYPE_LABELS: Record<string, string> = {
  one_time: "単品",
  subscription: "定期",
};

/** 注文タイプ列に表示する、定期お届け頻度の短縮ラベル(表示順もこの並びに揃える)。 */
const SUBSCRIPTION_INTERVAL_SHORT_LABELS: Record<string, string> = {
  biweekly: "2週",
  monthly: "1か月",
  bimonthly: "2か月",
};
const SUBSCRIPTION_INTERVAL_ORDER = ["biweekly", "monthly", "bimonthly"];

function formatSubscriptionIntervals(intervals: string[]): string {
  return SUBSCRIPTION_INTERVAL_ORDER.filter((key) => intervals.includes(key))
    .map((key) => SUBSCRIPTION_INTERVAL_SHORT_LABELS[key])
    .join("・");
}

export interface ProductRow {
  id: string;
  name: string;
  price: number;
  firstTimePrice: number | null;
  shippingFee: number;
  orderType: string;
  subscriptionIntervals: string[];
  smaregiProductId: string | null;
  productGroupName: string | null;
  isActive: boolean;
}

export function ProductsTable({ initialProducts }: { initialProducts: ProductRow[] }) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const filtered = products.filter((p) => {
    if (!showArchived && !p.isActive) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.productGroupName ?? "").toLowerCase().includes(q);
  });

  async function handleDelete(id: string) {
    setPending(id);
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: typeof body.error === "string" ? body.error : "削除に失敗しました",
        type: "error",
      });
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  async function toggleArchive(product: ProductRow) {
    setPending(product.id);
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    setPending(null);

    if (!res.ok) {
      setToast({ message: "更新に失敗しました", type: "error" });
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, isActive: !p.isActive } : p)));
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
        first_time_price: number | null;
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
        firstTimePrice: created.first_time_price,
        shippingFee: created.shipping_fee,
        orderType: created.order_type,
        subscriptionIntervals: created.subscription_intervals,
        smaregiProductId: created.smaregi_product_id,
        productGroupName: product.productGroupName,
        isActive: true,
      },
    ]);
    setPending(null);
    setToast({ message: `「${product.name}」を複製しました`, type: "success" });
    router.refresh();
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          className="input max-w-sm"
          placeholder="商品名・アイテムで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          アーカイブ済みも表示
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-sky-100 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-2">商品コード</th>
              <th className="px-4 py-2">商品名</th>
              <th className="px-4 py-2">アイテム</th>
              <th className="px-4 py-2">価格(税込)</th>
              <th className="px-4 py-2">初回特別価格(税込)</th>
              <th className="px-4 py-2">送料</th>
              <th className="px-4 py-2">注文タイプ</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id} className={`border-t border-neutral-100 ${!product.isActive ? "opacity-50" : ""}`}>
                <td className="px-4 py-2">{product.smaregiProductId ?? "-"}</td>
                <td className="px-4 py-2">
                  <Link href={`/admin/products/${product.id}`} className="text-blue-600 hover:underline">
                    {product.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{product.productGroupName ?? "-"}</td>
                <td className="px-4 py-2">{product.price.toLocaleString()}円</td>
                <td className="px-4 py-2">
                  {product.firstTimePrice === null ? "-" : `${product.firstTimePrice.toLocaleString()}円`}
                </td>
                <td className="px-4 py-2">
                  {product.shippingFee === 0 ? "送料無料" : `${product.shippingFee.toLocaleString()}円`}
                </td>
                <td className="px-4 py-2">
                  {ORDER_TYPE_LABELS[product.orderType]}
                  {product.orderType === "subscription" &&
                    product.subscriptionIntervals?.length > 0 &&
                    `(${formatSubscriptionIntervals(product.subscriptionIntervals)})`}
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    disabled={pending === product.id}
                    onClick={() => toggleArchive(product)}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      product.isActive ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {product.isActive ? "有効" : "アーカイブ済み"}
                  </button>
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
                  <ConfirmButton
                    label="削除"
                    disabled={pending === product.id}
                    onConfirm={() => handleDelete(product.id)}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
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
