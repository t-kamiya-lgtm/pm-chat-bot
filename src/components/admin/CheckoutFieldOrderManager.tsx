"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ADDRESS_FIELD_KEYS,
  ADDRESS_KEY_SET,
  CHECKOUT_FIELD_LABELS,
  type CheckoutFieldKey,
} from "@/lib/checkout-fields";

interface DisplayGroup {
  id: string;
  label: string;
  keys: CheckoutFieldKey[];
}

/** 郵便番号〜番地・建物名はウィジェット上で常に1画面にまとめて表示されるため、1行として扱う。 */
function buildDisplayGroups(order: CheckoutFieldKey[]): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  let addressAdded = false;
  for (const key of order) {
    if (ADDRESS_KEY_SET.has(key)) {
      if (!addressAdded) {
        groups.push({ id: "address", label: "お届け先住所(まとめて1画面に表示)", keys: ADDRESS_FIELD_KEYS });
        addressAdded = true;
      }
    } else {
      groups.push({ id: key, label: CHECKOUT_FIELD_LABELS[key], keys: [key] });
    }
  }
  return groups;
}

export function CheckoutFieldOrderManager({ initialOrder }: { initialOrder: CheckoutFieldKey[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<CheckoutFieldKey[]>(initialOrder);
  const [saving, setSaving] = useState(false);

  const groups = buildDisplayGroups(order);

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
    if (targetIndex < 0 || targetIndex >= groups.length) return;
    const nextGroups = [...groups];
    [nextGroups[index], nextGroups[targetIndex]] = [nextGroups[targetIndex], nextGroups[index]];
    saveOrder(nextGroups.flatMap((g) => g.keys));
  }

  return (
    <div className="max-w-md space-y-2">
      {groups.map((group, index) => (
        <div
          key={group.id}
          className="flex items-center justify-between rounded-md border border-neutral-200 bg-white p-3"
        >
          <span className="text-sm">
            {index + 1}. {group.label}
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
              disabled={saving || index === groups.length - 1}
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
