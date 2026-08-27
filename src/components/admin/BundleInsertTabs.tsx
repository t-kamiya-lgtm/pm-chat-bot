"use client";

import { useState } from "react";
import { BundleInsertItemsList, type BundleInsertItemRow } from "@/components/admin/BundleInsertItemsList";
import { BundleInsertSetsList, type BundleInsertSetRow, type BundleInsertItemOption } from "@/components/admin/BundleInsertSetsList";

interface BrandOption {
  id: string;
  name: string;
  code: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  smaregi_product_id: string | null;
}

const TABS = [
  { key: "items", label: "①同梱物登録" },
  { key: "sets", label: "②同梱物設定" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 同梱物登録(個々のマスタ)と同梱物設定(セット化)を1画面にまとめ、タブで切り替える。 */
export function BundleInsertTabs({
  items,
  sets,
  brands,
  products,
}: {
  items: BundleInsertItemRow[];
  sets: BundleInsertSetRow[];
  brands: BrandOption[];
  products: ProductOption[];
}) {
  const [tab, setTab] = useState<TabKey>("items");
  // 無効化した同梱物は新規セットの選択肢から外す(過去に選択済みのセットの表示には影響しない)。
  const itemOptions: BundleInsertItemOption[] = items
    .filter((i) => i.status === "active")
    .map((i) => ({
      id: i.id,
      brand_id: i.brand_id,
      name: i.name,
      item_type: i.item_type,
    }));

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "items" ? (
        <BundleInsertItemsList initialItems={items} brands={brands} />
      ) : (
        <BundleInsertSetsList initialSets={sets} brands={brands} products={products} items={itemOptions} />
      )}
    </div>
  );
}
