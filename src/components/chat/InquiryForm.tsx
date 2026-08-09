"use client";

import { useState } from "react";

export function InquiryForm({
  productName,
  onSent,
}: {
  productName?: string;
  onSent: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const chatUrl = typeof window !== "undefined" ? window.location.href : undefined;
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, message, productName, chatUrl }),
    });

    setSubmitting(false);
    if (!res.ok) {
      setError("送信に失敗しました。しばらくしてから再度お試しください。");
      return;
    }
    onSent();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-[90%] space-y-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm"
    >
      <p className="text-sm font-medium">お問い合わせ</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        required
        placeholder="お名前"
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        required
        type="email"
        placeholder="メールアドレス"
        className="input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <textarea
        required
        placeholder="お問い合わせ内容"
        className="input"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {submitting ? "送信中..." : "送信する"}
      </button>
    </form>
  );
}
