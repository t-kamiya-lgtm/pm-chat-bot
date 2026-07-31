"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewScenarioButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const name = window.prompt("シナリオ名を入力してください");
    if (!name) return;

    setCreating(true);
    const res = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);

    if (res.ok) {
      const body = await res.json();
      router.push(`/admin/scenarios/${body.scenario.id}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={creating}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
    >
      シナリオを作成
    </button>
  );
}
