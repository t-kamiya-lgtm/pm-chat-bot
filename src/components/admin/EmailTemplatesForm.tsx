"use client";

import { useState } from "react";
import { Toast } from "@/components/admin/Toast";

export function EmailTemplatesForm({
  initialOrderCompletionSubject,
  initialOrderCompletionBody,
  initialRenewalSubject,
  initialRenewalBody,
  initialAbandonedLeadSubject,
  initialAbandonedLeadBody,
}: {
  initialOrderCompletionSubject: string;
  initialOrderCompletionBody: string;
  initialRenewalSubject: string;
  initialRenewalBody: string;
  initialAbandonedLeadSubject: string;
  initialAbandonedLeadBody: string;
}) {
  const [orderCompletionSubject, setOrderCompletionSubject] = useState(initialOrderCompletionSubject);
  const [orderCompletionBody, setOrderCompletionBody] = useState(initialOrderCompletionBody);
  const [renewalSubject, setRenewalSubject] = useState(initialRenewalSubject);
  const [renewalBody, setRenewalBody] = useState(initialRenewalBody);
  const [abandonedLeadSubject, setAbandonedLeadSubject] = useState(initialAbandonedLeadSubject);
  const [abandonedLeadBody, setAbandonedLeadBody] = useState(initialAbandonedLeadBody);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    const res = await fetch("/api/email-templates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderCompletionSubject,
        orderCompletionBody,
        renewalSubject,
        renewalBody,
        abandonedLeadSubject,
        abandonedLeadBody,
      }),
    });

    setSaving(false);
    setToast(
      res.ok ? { message: "保存しました", type: "success" } : { message: "保存に失敗しました", type: "error" },
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <div>
          <p className="text-sm font-medium text-neutral-700">注文完了メール</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            決済確定時に購入者へ送信されます。差し込み項目:
            {" "}
            {"{{customer_name}} {{product_name}} {{order_number}} {{quantity}} {{total_amount}}"}
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input
            className="input"
            value={orderCompletionSubject}
            onChange={(e) => setOrderCompletionSubject(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={orderCompletionBody}
            onChange={(e) => setOrderCompletionBody(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <div>
          <p className="text-sm font-medium text-neutral-700">定期便メール(2回目以降のお届け)</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            定期購入の2回目以降の周期課金が完了するたびに送信されます。差し込み項目:
            {" "}
            {"{{customer_name}} {{product_name}} {{quantity}} {{total_amount}} {{cycle_number}}"}
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input className="input" value={renewalSubject} onChange={(e) => setRenewalSubject(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={renewalBody}
            onChange={(e) => setRenewalBody(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <div>
          <p className="text-sm font-medium text-neutral-700">離脱者リマインドメール</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            注文フォームの入力途中で1時間以上離脱したお客様へ送信されます。差し込み項目:
            {" "}
            {"{{customer_name}} {{product_name}} {{chat_url}} {{unsubscribe_url}}"}
            <br />
            配信停止リンク({"{{unsubscribe_url}}"})は特定電子メール法対応のため必ず本文に含めてください。
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input
            className="input"
            value={abandonedLeadSubject}
            onChange={(e) => setAbandonedLeadSubject(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={abandonedLeadBody}
            onChange={(e) => setAbandonedLeadBody(e.target.value)}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}
