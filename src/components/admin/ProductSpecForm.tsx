"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ProductSpecFormValues {
  ingredients: string;
  allergens: string;
  volume: string;
  usage: string;
}

export function ProductSpecForm({
  productId,
  initialValues,
}: {
  productId: string;
  initialValues?: ProductSpecFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductSpecFormValues>(
    initialValues ?? { ingredients: "", allergens: "", volume: "", usage: "" },
  );
  const [status, setStatus] = useState<"idle" | "saving" | "generating" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);

    const res = await fetch(`/api/products/${productId}/spec`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, extra: {} }),
    });

    if (!res.ok) {
      setStatus("idle");
      setMessage("仕様情報の保存に失敗しました");
      return;
    }
    setStatus("idle");
    setMessage("仕様情報を保存しました");
    router.refresh();
  }

  async function handleGenerateFaqs() {
    setStatus("generating");
    setMessage(null);

    const res = await fetch("/api/faqs/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus("idle");
      setMessage(`QA生成に失敗しました: ${JSON.stringify(body.error ?? "")}`);
      return;
    }
    const body = await res.json();
    setStatus("done");
    setMessage(`${body.faqs?.length ?? 0}件のQA候補を生成しました(要レビュー)`);
  }

  return (
    <div className="mt-8 max-w-xl space-y-5 border-t border-neutral-200 pt-6">
      <h2 className="text-lg font-medium">商品仕様情報(商品QA生成の元データ)</h2>
      {message && <p className="text-sm text-neutral-600">{message}</p>}

      <form onSubmit={handleSave} className="space-y-4">
        <SpecField
          label="原材料"
          value={values.ingredients}
          onChange={(v) => setValues((p) => ({ ...p, ingredients: v }))}
        />
        <SpecField
          label="アレルギー"
          value={values.allergens}
          onChange={(v) => setValues((p) => ({ ...p, allergens: v }))}
        />
        <SpecField
          label="容量"
          value={values.volume}
          onChange={(v) => setValues((p) => ({ ...p, volume: v }))}
        />
        <SpecField
          label="使い方"
          value={values.usage}
          onChange={(v) => setValues((p) => ({ ...p, usage: v }))}
        />

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            仕様情報を保存
          </button>
          <button
            type="button"
            onClick={handleGenerateFaqs}
            disabled={status === "generating"}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            {status === "generating" ? "生成中..." : "商品QAを生成"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SpecField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        rows={2}
      />
    </label>
  );
}
