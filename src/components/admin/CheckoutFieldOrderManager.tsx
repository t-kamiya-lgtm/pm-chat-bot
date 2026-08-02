"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHECKOUT_FIELD_LABELS, type CheckoutFieldKey } from "@/lib/checkout-fields";

export function CheckoutFieldOrderManager({ initialOrder }: { initialOrder: CheckoutFieldKey[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<CheckoutFieldKey[]>(initialOrder);
  const [saving, setSaving] = useState(false);

  async function saveOrder(next: CheckoutFieldKey[]) {
    setOrder(next);
    setSaving(true);
    await fetch("/api/checkout-fields", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: next }),
    });
    setSaving(false);
    router.refresh();
  }

  function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    const next = [...order];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    saveOrder(next);
  }

  return (
    <div className="max-w-md space-y-2">
      {order.map((fieldKey, index) => (
        <div
          key={fieldKey}
          className="flex items-center justify-between rounded-md border border-neutral-200 bg-white p-3"
        >
          <span className="text-sm">
            {index + 1}. {CHECKOUT_FIELD_LABELS[fieldKey]}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={saving || index === 0}
              onClick={() => move(index, -1)}
              className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={saving || index === order.length - 1}
              onClick={() => move(index, 1)}
              className="rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-30"
            >
              ▼
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
