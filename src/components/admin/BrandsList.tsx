"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Toast } from "@/components/admin/Toast";

export interface BrandRow {
  id: string;
  name: string;
  groups: { id: string; name: string }[];
}

export function BrandsList({ initialBrands }: { initialBrands: BrandRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function startEdit(brand: BrandRow) {
    setEditingId(brand.id);
    setEditValue(brand.name);
  }

  async function handleRename(brand: BrandRow) {
    const name = editValue.trim();
    if (!name || name === brand.name) {
      setEditingId(null);
      return;
    }

    setPending(brand.id);
    const res = await fetch(`/api/brands/${brand.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `名称の変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setEditingId(null);
    setToast({ message: "ブランド名を変更しました", type: "success" });
    router.refresh();
  }

  async function handleDelete(brand: BrandRow) {
    setPending(brand.id);
    const res = await fetch(`/api/brands/${brand.id}`, { method: "DELETE" });
    setPending(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      {initialBrands.map((brand) => (
        <div key={brand.id} className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {editingId === brand.id ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="input flex-1"
                />
                <button
                  type="button"
                  disabled={pending === brand.id}
                  onClick={() => handleRename(brand)}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <p className="font-medium">{brand.name}</p>
            )}
            {editingId !== brand.id && (
              <div className="flex shrink-0 gap-3 text-sm">
                <button
                  type="button"
                  disabled={pending === brand.id}
                  onClick={() => startEdit(brand)}
                  className="text-blue-600 hover:underline disabled:opacity-30"
                >
                  名前を編集
                </button>
                <ConfirmButton
                  label="削除"
                  confirmLabel="アイテムのブランド設定が解除されます。よろしいですか？"
                  disabled={pending === brand.id}
                  onConfirm={() => handleDelete(brand)}
                />
              </div>
            )}
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
