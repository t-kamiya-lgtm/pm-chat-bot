"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";

export function ProductGroupBrandSelect({
  productGroupId,
  brands,
  initialBrandId,
}: {
  productGroupId: string;
  brands: { id: string; name: string }[];
  initialBrandId: string | null;
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(initialBrandId ?? "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleChange(value: string) {
    const previous = brandId;
    setBrandId(value);
    setSaving(true);
    const res = await fetch(`/api/product-groups/${productGroupId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brandId: value || null }),
    });
    setSaving(false);
    if (!res.ok) {
      setBrandId(previous);
      setToast({ message: "ブランドの更新に失敗しました", type: "error" });
      return;
    }
    router.refresh();
  }

  return (
    <label className="block text-sm">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <span className="mb-1 block font-medium text-neutral-700">ブランド(任意)</span>
      <select
        className="input w-auto"
        value={brandId}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">未設定</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
