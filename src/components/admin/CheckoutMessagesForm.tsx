"use client";

import { useState } from "react";
import { Toast } from "@/components/admin/Toast";

export function CheckoutMessagesForm({
  initialGreeting,
  initialCompletionMessage,
  initialTermsText,
  initialPrivacyText,
}: {
  initialGreeting: string;
  initialCompletionMessage: string;
  initialTermsText: string;
  initialPrivacyText: string;
}) {
  const [greeting, setGreeting] = useState(initialGreeting);
  const [completionMessage, setCompletionMessage] = useState(initialCompletionMessage);
  const [termsText, setTermsText] = useState(initialTermsText);
  const [privacyText, setPrivacyText] = useState(initialPrivacyText);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    const res = await fetch("/api/checkout-messages", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ greeting, completionMessage, termsText, privacyText }),
    });

    setSaving(false);
    setToast(
      res.ok ? { message: "保存しました", type: "success" } : { message: "保存に失敗しました", type: "error" },
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          あいさつ文(任意・注文フォーム開始時に全商品共通で表示)
        </span>
        <textarea
          className="input"
          rows={4}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          注文確認メッセージ(任意・注文確定後に全商品共通で表示)
        </span>
        <textarea
          className="input"
          rows={3}
          value={completionMessage}
          onChange={(e) => setCompletionMessage(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          特定商取引法に基づく表記(任意・注文確認画面のスクロールボックスに表示)
        </span>
        <textarea
          className="input font-mono"
          rows={8}
          value={termsText}
          onChange={(e) => setTermsText(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          個人情報の取り扱いについて(任意・注文確認画面のスクロールボックスに表示)
        </span>
        <textarea
          className="input font-mono"
          rows={8}
          value={privacyText}
          onChange={(e) => setPrivacyText(e.target.value)}
        />
      </label>

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
