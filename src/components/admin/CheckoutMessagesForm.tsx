"use client";

import { useState } from "react";

export function CheckoutMessagesForm({
  initialGreeting,
  initialCompletionMessage,
}: {
  initialGreeting: string;
  initialCompletionMessage: string;
}) {
  const [greeting, setGreeting] = useState(initialGreeting);
  const [completionMessage, setCompletionMessage] = useState(initialCompletionMessage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/checkout-messages", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ greeting, completionMessage }),
    });

    setSaving(false);
    setMessage(res.ok ? "保存しました" : "保存に失敗しました");
  }

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-4">
      {message && <p className="text-sm text-neutral-600">{message}</p>}

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
