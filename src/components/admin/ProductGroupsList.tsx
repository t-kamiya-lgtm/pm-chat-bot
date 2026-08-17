"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Toast } from "@/components/admin/Toast";

export interface ProductGroupRow {
  id: string;
  name: string;
}

export function ProductGroupsList({ initialGroups }: { initialGroups: ProductGroupRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function startEdit(group: ProductGroupRow) {
    setEditingId(group.id);
    setEditValue(group.name);
  }

  async function handleRename(group: ProductGroupRow) {
    const name = editValue.trim();
    if (!name || name === group.name) {
      setEditingId(null);
      return;
    }

    setPending(group.id);
    const res = await fetch(`/api/product-groups/${group.id}`, {
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
    setToast({ message: "アイテム名を変更しました", type: "success" });
    router.refresh();
  }

  async function handleDelete(group: ProductGroupRow) {
    setPending(group.id);
    const res = await fetch(`/api/product-groups/${group.id}`, { method: "DELETE" });
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
      {initialGroups.map((group) => (
        <div
          key={group.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-sm"
        >
          {editingId === group.id ? (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="input flex-1"
              />
              <button
                type="button"
                disabled={pending === group.id}
                onClick={() => handleRename(group)}
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
            <Link href={`/admin/product-groups/${group.id}`} className="flex-1">
              {group.name}
            </Link>
          )}
          {editingId !== group.id && (
            <div className="flex shrink-0 gap-3 text-sm">
              <button
                type="button"
                disabled={pending === group.id}
                onClick={() => startEdit(group)}
                className="text-blue-600 hover:underline disabled:opacity-30"
              >
                名前を編集
              </button>
              <ConfirmButton
                label="削除"
                confirmLabel="紐づく品番・仕様情報・QAも削除されます。よろしいですか？"
                disabled={pending === group.id}
                onConfirm={() => handleDelete(group)}
              />
            </div>
          )}
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
