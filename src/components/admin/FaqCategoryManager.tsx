"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductFaqCategory } from "@/lib/types";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

export function FaqCategoryManager({
  productGroupId,
  categories,
}: {
  productGroupId: string;
  categories: ProductFaqCategory[];
}) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    setBusy(true);
    await fetch(`/api/product-groups/${productGroupId}/faq-categories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    setBusy(false);
    setNewTitle("");
    router.refresh();
  }

  async function handleRename(categoryId: string, title: string) {
    setBusy(true);
    await fetch(`/api/product-groups/${productGroupId}/faq-categories/${categoryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setBusy(false);
    router.refresh();
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = categories[index];
    const swapWith = categories[index + direction];
    if (!target || !swapWith) return;

    setBusy(true);
    await Promise.all([
      fetch(`/api/product-groups/${productGroupId}/faq-categories/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: swapWith.displayOrder }),
      }),
      fetch(`/api/product-groups/${productGroupId}/faq-categories/${swapWith.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayOrder: target.displayOrder }),
      }),
    ]);
    setBusy(false);
    router.refresh();
  }

  async function handleDelete(categoryId: string) {
    setBusy(true);
    await fetch(`/api/product-groups/${productGroupId}/faq-categories/${categoryId}`, {
      method: "DELETE",
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {categories.map((category, index) => (
        <div key={category.id} className="flex items-center gap-2 rounded-md border border-neutral-200 p-2">
          <div className="flex flex-col">
            <button
              type="button"
              disabled={busy || index === 0}
              onClick={() => handleMove(index, -1)}
              className="text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={busy || index === categories.length - 1}
              onClick={() => handleMove(index, 1)}
              className="text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
            >
              ▼
            </button>
          </div>
          <input
            className="input flex-1"
            defaultValue={category.title}
            onBlur={(e) => {
              if (e.target.value !== category.title) handleRename(category.id, e.target.value);
            }}
          />
          <ConfirmButton
            label="削除"
            confirmLabel="紐づくQAは未分類になります。よろしいですか？"
            disabled={busy}
            onConfirm={() => handleDelete(category.id)}
          />
        </div>
      ))}
      {categories.length === 0 && (
        <p className="text-sm text-neutral-400">カテゴリはまだありません(QA自動生成時に自動作成されます)</p>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="新しいカテゴリ名"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          追加
        </button>
      </form>
    </div>
  );
}
