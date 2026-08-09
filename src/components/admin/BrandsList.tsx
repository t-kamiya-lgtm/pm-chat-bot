"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface BrandRow {
  id: string;
  name: string;
  groups: { id: string; name: string }[];
}

export function BrandsList({ initialBrands }: { initialBrands: BrandRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function handleRename(brand: BrandRow) {
    const name = window.prompt("新しいブランド名を入力してください", brand.name);
    if (!name || name === brand.name) return;

    setPending(brand.id);
    const res = await fetch(`/api/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(`名称の変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    router.refresh();
  }

  async function handleDelete(brand: BrandRow) {
    if (
      !window.confirm(
        `「${brand.name}」を削除しますか？紐づくアイテムのブランド設定は解除されます(アイテム自体は削除されません)。`,
      )
    )
      return;

    setPending(brand.id);
    const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      window.alert(`削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {initialBrands.map((brand) => (
        <div key={brand.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">{brand.name}</p>
            <div className="flex shrink-0 gap-3 text-sm">
              <button
                type="button"
                disabled={pending === brand.id}
                onClick={() => handleRename(brand)}
                className="text-blue-600 hover:underline disabled:opacity-30"
              >
                名前を編集
              </button>
              <button
                type="button"
                disabled={pending === brand.id}
                onClick={() => handleDelete(brand)}
                className="text-red-600 hover:underline disabled:opacity-30"
              >
                削除
              </button>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {brand.groups.map((g) => (
              <Link
                key={g.id}
                href={`/admin/product-groups/${g.id}`}
                className="block text-sm text-blue-600 hover:underline"
              >
                {g.name}
              </Link>
            ))}
            {brand.groups.length === 0 && <p className="text-sm text-neutral-400">紐づくアイテムがありません</p>}
          </div>
        </div>
      ))}
      {initialBrands.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
          ブランドが登録されていません
        </p>
      )}
    </div>
  );
}
