"use client";

import { useState } from "react";
import { Toast } from "@/components/admin/Toast";
import {
  ADDRESS_FIELD_KEYS,
  ADDRESS_KEY_SET,
  CHECKOUT_FIELD_LABELS,
  DELIVERY_FIELD_KEYS,
  DELIVERY_KEY_SET,
  type CheckoutFieldKey,
} from "@/lib/checkout-fields";

interface DisplayGroup {
  id: string;
  label: string;
  keys: CheckoutFieldKey[];
}

/** 住所4項目・お届け希望日時2項目はウィジェット上で常に1画面にまとめて表示されるため、1行として扱う。 */
function buildDisplayGroups(order: CheckoutFieldKey[]): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  let addressAdded = false;
  let deliveryAdded = false;
  for (const key of order) {
    if (ADDRESS_KEY_SET.has(key)) {
      if (!addressAdded) {
        groups.push({ id: "address", label: "お届け先住所(まとめて1画面に表示)", keys: ADDRESS_FIELD_KEYS });
        addressAdded = true;
      }
    } else if (DELIVERY_KEY_SET.has(key)) {
      if (!deliveryAdded) {
        groups.push({
          id: "delivery",
          label: "お届け希望日・時間帯(まとめて1画面に表示)",
          keys: DELIVERY_FIELD_KEYS,
        });
        deliveryAdded = true;
      }
    } else {
      groups.push({ id: key, label: CHECKOUT_FIELD_LABELS[key], keys: [key] });
    }
  }
  return groups;
}

/**
 * 決済フォーム(1問1答)の質問表示順を、このシナリオの必須ブロックとして編集する。
 * 通常ノードとは異なり削除はできず、ブロック内部での並び替え(▲▼)のみ可能。
 * ブロックの間に通常ノードを差し込ませないよう、意図的に「ノードを追加」導線は設けていない。
 */
export function ScenarioCheckoutFieldsSection({
  scenarioId,
  initialOrder,
}: {
  scenarioId: string;
  initialOrder: CheckoutFieldKey[];
}) {
  const [order, setOrder] = useState<CheckoutFieldKey[]>(initialOrder);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const groups = buildDisplayGroups(order);

  async function saveOrder(next: CheckoutFieldKey[]) {
    const previous = order;
    setOrder(next);
    setSaving(true);
    const res = await fetch("/api/checkout-fields", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId, order: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setOrder(previous);
      setToast({ message: "表示順の保存に失敗しました", type: "error" });
    }
  }

  function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= groups.length) return;
    const nextGroups = [...groups];
    [nextGroups[index], nextGroups[targetIndex]] = [nextGroups[targetIndex], nextGroups[index]];
    saveOrder(nextGroups.flatMap((g) => g.keys));
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          必須ブロック・決済フォーム
        </span>
        <span className="text-xs text-neutral-500">質問順はこのブロック内でのみ入れ替えられます</span>
      </div>
      <div className="space-y-1.5">
        {groups.map((group, index) => (
          <div
            key={group.id}
            className="flex items-center justify-between rounded-md border border-amber-200 bg-white p-2.5"
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
    </div>
  );
}
