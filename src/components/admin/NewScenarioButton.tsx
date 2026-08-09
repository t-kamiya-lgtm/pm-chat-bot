"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewScenarioButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    setError(null);
    const res = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(`シナリオの作成に失敗しました: ${JSON.stringify(body.error ?? res.status)}`);
      return;
    }
    const body = await res.json();
    router.push(`/admin/scenarios/${body.scenario.id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
      >
        シナリオを作成
      </button>
    );
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2">
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="シナリオ名"
        className="input"
      />
      <button
        type="submit"
        disabled={creating}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {creating ? "作成中..." : "作成する"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
          setError(null);
        }}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
      >
        キャンセル
      </button>
    </form>
  );
}
