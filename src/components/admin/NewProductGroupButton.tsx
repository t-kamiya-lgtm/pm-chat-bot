"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProductGroupButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const name = window.prompt("商品種類名を入力してください(例: プロテイン チョコレート味)");
    if (!name) return;

    setCreating(true);
    const res = await fetch("/api/product-groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);

    if (res.ok) {
      const body = await res.json();
      router.push(`/admin/product-groups/${body.productGroup.id}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={creating}
      className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
    >
      商品種類を登録
    </button>
  );
}
