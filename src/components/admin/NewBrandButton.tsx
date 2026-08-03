"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewBrandButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const name = window.prompt("ブランド名を入力してください(例: プロテインモンスター)");
    if (!name) return;

    setCreating(true);
    await fetch("/api/brands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={creating}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
    >
      ブランドを登録
    </button>
  );
}
