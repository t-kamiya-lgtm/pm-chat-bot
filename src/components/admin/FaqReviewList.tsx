"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductFaq } from "@/lib/types";

const STATUS_LABELS: Record<ProductFaq["status"], string> = {
  draft: "レビュー待ち",
  published: "公開中",
  rejected: "却下",
};

export function FaqReviewList({ faqs }: { faqs: ProductFaq[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Record<string, { question: string; answer: string }>>({});
  const [pending, setPending] = useState<string | null>(null);

  async function updateFaq(
    id: string,
    body: Partial<{ status: ProductFaq["status"]; question: string; answer: string }>,
  ) {
    setPending(id);
    await fetch(`/api/faqs/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {faqs.map((faq) => {
        const draft = editing[faq.id] ?? { question: faq.question, answer: faq.answer };
        return (
          <div key={faq.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  faq.status === "published"
                    ? "bg-green-100 text-green-800"
                    : faq.status === "rejected"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {STATUS_LABELS[faq.status]}
              </span>
              <span className="text-xs text-neutral-400">
                {faq.source === "generated" ? "AI生成" : "手動作成"}
              </span>
            </div>

            <label className="mb-2 block text-sm">
              <span className="mb-1 block text-neutral-500">質問</span>
              <input
                className="input"
                value={draft.question}
                onChange={(e) =>
                  setEditing((p) => ({ ...p, [faq.id]: { ...draft, question: e.target.value } }))
                }
              />
            </label>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-neutral-500">回答</span>
              <textarea
                className="input"
                rows={2}
                value={draft.answer}
                onChange={(e) =>
                  setEditing((p) => ({ ...p, [faq.id]: { ...draft, answer: e.target.value } }))
                }
              />
            </label>

            <div className="flex gap-2 text-sm">
              <button
                type="button"
                disabled={pending === faq.id}
                onClick={() => updateFaq(faq.id, { question: draft.question, answer: draft.answer })}
                className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-50"
              >
                内容を保存
              </button>
              <button
                type="button"
                disabled={pending === faq.id}
                onClick={() => updateFaq(faq.id, { status: "published" })}
                className="rounded-md bg-green-600 px-3 py-1.5 text-white hover:bg-green-700 disabled:opacity-50"
              >
                承認して公開
              </button>
              <button
                type="button"
                disabled={pending === faq.id}
                onClick={() => updateFaq(faq.id, { status: "rejected" })}
                className="rounded-md border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                却下
              </button>
            </div>
          </div>
        );
      })}
      {faqs.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
          対象のQAはありません
        </p>
      )}
    </div>
  );
}
