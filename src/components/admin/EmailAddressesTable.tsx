"use client";

import { useState } from "react";
import { Toast } from "@/components/admin/Toast";

export interface ScenarioEmailRow {
  id: string;
  name: string;
  emailFromAddress: string | null;
  inquiryReceiveEmail: string | null;
  inquiryAutoReplyFrom: string | null;
  orderConfirmationFrom: string | null;
  abandonedReminderFrom: string | null;
  cancellationFrom: string | null;
  shipmentCompleteFrom: string | null;
}

type EditableField = Exclude<keyof ScenarioEmailRow, "id" | "name" | "emailFromAddress">;

const FIELDS: { key: EditableField; label: string }[] = [
  { key: "inquiryReceiveEmail", label: "①問い合わせ受領アドレス" },
  { key: "inquiryAutoReplyFrom", label: "①問い合わせ自動返信 送信元" },
  { key: "orderConfirmationFrom", label: "②注文確認メール 送信元" },
  { key: "abandonedReminderFrom", label: "③離脱リマインド 送信元" },
  { key: "cancellationFrom", label: "④キャンセル確認 送信元" },
  { key: "shipmentCompleteFrom", label: "⑤出荷完了 送信元" },
];

/** シナリオ(横に並べたメール種別)×メール種別(縦)のアドレス一覧・編集画面。 */
export function EmailAddressesTable({ scenarios }: { scenarios: ScenarioEmailRow[] }) {
  const [rows, setRows] = useState(scenarios);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function updateField(id: string, key: EditableField, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    setSavedId(null);
  }

  async function handleSave(row: ScenarioEmailRow) {
    setSavingId(row.id);
    const res = await fetch(`/api/scenarios/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inquiryReceiveEmail: row.inquiryReceiveEmail?.trim() || null,
        inquiryAutoReplyFrom: row.inquiryAutoReplyFrom?.trim() || null,
        orderConfirmationFrom: row.orderConfirmationFrom?.trim() || null,
        abandonedReminderFrom: row.abandonedReminderFrom?.trim() || null,
        cancellationFrom: row.cancellationFrom?.trim() || null,
        shipmentCompleteFrom: row.shipmentCompleteFrom?.trim() || null,
      }),
    });
    setSavingId(null);
    if (res.ok) {
      setSavedId(row.id);
      setToast({ message: "保存しました", type: "success" });
    } else {
      setToast({ message: "保存に失敗しました", type: "error" });
    }
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="mb-1 text-sm font-semibold text-neutral-700">{row.name}</h3>
            <p className="mb-3 text-xs text-neutral-500">
              未設定の項目は、シナリオ編集画面の「自動メールの送信元アドレス」(共通デフォルト:{" "}
              {row.emailFromAddress || "未設定"})にフォールバックします。
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="block text-xs">
                  <span className="mb-1 block text-neutral-500">{f.label}</span>
                  <input
                    className="input"
                    value={row[f.key] ?? ""}
                    onChange={(e) => updateField(row.id, f.key, e.target.value)}
                    placeholder="未設定(共通デフォルトを使用)"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => handleSave(row)}
              disabled={savingId === row.id}
              className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingId === row.id ? "保存中..." : savedId === row.id ? "保存済み" : "保存する"}
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            シナリオがまだありません
          </p>
        )}
      </div>
    </div>
  );
}
