"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";

export function NewBrandButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    setToast(null);
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: `ブランドの登録に失敗しました: ${JSON.stringify(body.error ?? res.status)}`,
        type: "error",
      });
      return;
    }
    setOpen(false);
    setName("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
      >
        ブランドを登録
      </button>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="例: プロテインモンスター"
        className="input"
      />
      <button
        type="submit"
        disabled={creating}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {creating ? "登録中..." : "登録する"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
          setToast(null);
        }}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
      >
        キャンセル
      </button>
    </form>
  );
}
