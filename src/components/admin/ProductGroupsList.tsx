"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ProductGroupRow {
  id: string;
  name: string;
}

export function ProductGroupsList({ initialGroups }: { initialGroups: ProductGroupRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function handleRename(group: ProductGroupRow) {
    const name = window.prompt("新しいアイテム名を入力してください", group.name);
    if (!name || name === group.name) return;

    setPending(group.id);
    const res = await fetch(`/api/product-groups/${group.id}`, {
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

  async function handleDelete(group: ProductGroupRow) {
    if (
      !window.confirm(
        `「${group.name}」を削除しますか？紐づく品番・仕様情報・QAも合わせて削除され、取り消せません。`,
      )
    )
      return;

    setPending(group.id);
    const res = await fetch(`/api/product-groups/${group.id}`, { method: "DELETE" });
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
      {initialGroups.map((group) => (
        <div
          key={group.id}
          className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-sm"
        >
          <Link href={`/admin/product-groups/${group.id}`} className="flex-1">
            {group.name}
          </Link>
          <div className="flex shrink-0 gap-3 text-sm">
            <button
              type="button"
              disabled={pending === group.id}
              onClick={() => handleRename(group)}
              className="text-blue-600 hover:underline disabled:opacity-30"
            >
              名前を編集
            </button>
            <button
              type="button"
              disabled={pending === group.id}
              onClick={() => handleDelete(group)}
              className="text-red-600 hover:underline disabled:opacity-30"
            >
              削除
            </button>
          </div>
        </div>
      ))}
      {initialGroups.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
          アイテムが登録されていません
        </p>
      )}
    </div>
  );
}
