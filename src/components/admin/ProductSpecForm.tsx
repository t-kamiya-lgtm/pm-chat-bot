"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";

export interface ProductSpecFormValues {
  ingredients: string;
  allergens: string;
  volume: string;
  usage: string;
  nutrition: string;
}

export function ProductSpecForm({
  productGroupId,
  initialValues,
}: {
  productGroupId: string;
  initialValues?: ProductSpecFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductSpecFormValues>(
    initialValues ?? { ingredients: "", allergens: "", volume: "", usage: "", nutrition: "" },
  );
  const [status, setStatus] = useState<"idle" | "saving" | "generating" | "done">("idle");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const skipResetRef = useRef(true);

  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setJustSaved(false);
  }, [values]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setToast(null);

    const res = await fetch(`/api/product-groups/${productGroupId}/spec`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, extra: {} }),
    });

    if (!res.ok) {
      setStatus("idle");
      setToast({ message: "仕様情報の保存に失敗しました", type: "error" });
      return;
    }
    setStatus("idle");
    setJustSaved(true);
    setToast({ message: "仕様情報を保存しました", type: "success" });
    router.refresh();
  }

  async function handleGenerateFaqs() {
    setStatus("generating");
    setToast(null);

    const res = await fetch("/api/faqs/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productGroupId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus("idle");
      setToast({ message: `QA生成に失敗しました: ${JSON.stringify(body.error ?? "")}`, type: "error" });
      return;
    }
    const body = await res.json();
    setStatus("done");
    setToast({
      message: `${body.faqs?.length ?? 0}件のQA候補を生成しました(要レビュー)`,
      type: "success",
    });
    router.refresh();
  }

  return (
    <div className="mt-8 max-w-xl space-y-5 border-t border-neutral-200 pt-6">
      <h2 className="text-lg font-medium">商品仕様情報(商品QA生成の元データ)</h2>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

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
        <SpecField
          label="栄養成分表示"
          value={values.nutrition}
          onChange={(v) => setValues((p) => ({ ...p, nutrition: v }))}
          rows={5}
        />

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {status === "saving" ? "保存中..." : justSaved ? "保存済み" : "仕様情報を保存"}
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
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        rows={rows}
      />
    </label>
  );
}
