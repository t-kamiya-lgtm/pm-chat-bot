"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";

export function NewFaqForm({
  productGroupId,
  categories,
}: {
  productGroupId: string;
  categories: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);

    const res = await fetch("/api/faqs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productGroupId,
        categoryId: categoryId || undefined,
        question,
        answer,
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: typeof body.error === "string" ? body.error : "QAの登録に失敗しました",
        type: "error",
      });
      return;
    }
    setQuestion("");
    setAnswer("");
    setCategoryId("");
    setToast({ message: "QAを登録しました", type: "success" });
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-dashed border-neutral-300 p-4"
    >
      <h3 className="text-sm font-medium">QAを手動で登録</h3>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {categories.length > 0 && (
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">カテゴリ</span>
          <select
            className="input w-auto"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">カテゴリ未設定</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">質問</span>
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-500">回答</span>
        <textarea
          className="input"
          rows={2}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          required
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        登録して公開
      </button>
    </form>
  );
}
