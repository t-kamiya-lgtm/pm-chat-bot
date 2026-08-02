"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductOrderType, SubscriptionInterval } from "@/lib/types";

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  biweekly: "2週間ごと",
  monthly: "1ヶ月ごと",
  bimonthly: "2ヶ月ごと",
};

export interface ProductFormValues {
  id?: string;
  productGroupId: string;
  name: string;
  description: string;
  price: number;
  shippingFee: number;
  imageUrl: string;
  smaregiProductId: string;
  orderType: ProductOrderType;
  subscriptionIntervals: SubscriptionInterval[];
}

function emptyValues(defaultProductGroupId?: string): ProductFormValues {
  return {
    productGroupId: defaultProductGroupId ?? "",
    name: "",
    description: "",
    price: 0,
    shippingFee: 0,
    imageUrl: "",
    smaregiProductId: "",
    orderType: "one_time",
    subscriptionIntervals: [],
  };
}

export function ProductForm({
  initialValues,
  productGroups,
  lockProductGroup,
}: {
  initialValues?: ProductFormValues;
  productGroups: { id: string; name: string }[];
  lockProductGroup?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(
    initialValues ?? emptyValues(productGroups[0]?.id),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEdit = Boolean(values.id);

  function toggleInterval(interval: SubscriptionInterval) {
    setValues((prev) => ({
      ...prev,
      subscriptionIntervals: prev.subscriptionIntervals.includes(interval)
        ? prev.subscriptionIntervals.filter((i) => i !== interval)
        : [...prev.subscriptionIntervals, interval],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    if (!values.productGroupId) {
      setSubmitting(false);
      setErrorMessage("商品種類(親品番)を選択してください");
      return;
    }
    if (values.orderType === "subscription" && values.subscriptionIntervals.length === 0) {
      setSubmitting(false);
      setErrorMessage("定期購入の場合は周期を1つ以上選択してください");
      return;
    }

    const payload = {
      productGroupId: values.productGroupId,
      name: values.name,
      description: values.description || undefined,
      price: Number(values.price),
      shippingFee: Number(values.shippingFee),
      imageUrl: values.imageUrl || undefined,
      smaregiProductId: values.smaregiProductId || undefined,
      orderType: values.orderType,
      subscriptionIntervals: values.orderType === "subscription" ? values.subscriptionIntervals : [],
    };

    const res = await fetch(isEdit ? `/api/products/${values.id}` : "/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErrorMessage(JSON.stringify(body.error ?? "登録に失敗しました"));
      return;
    }

    router.push(isEdit ? `/admin/product-groups/${values.productGroupId}` : "/admin/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      {errorMessage && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>
      )}

      <Field label="商品種類(親品番)">
        <select
          required
          disabled={lockProductGroup}
          value={values.productGroupId}
          onChange={(e) => setValues((p) => ({ ...p, productGroupId: e.target.value }))}
          className="input"
        >
          <option value="" disabled>
            選択してください
          </option>
          {productGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="商品名(品番ごとの名称)">
        <input
          required
          value={values.name}
          onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
          className="input"
        />
      </Field>

      <Field label="説明">
        <textarea
          value={values.description}
          onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))}
          className="input"
          rows={3}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="価格(円)">
          <input
            type="number"
            required
            min={0}
            value={values.price}
            onChange={(e) => setValues((p) => ({ ...p, price: Number(e.target.value) }))}
            className="input"
          />
        </Field>
        <Field label="送料(円、0=送料無料)">
          <input
            type="number"
            min={0}
            value={values.shippingFee}
            onChange={(e) => setValues((p) => ({ ...p, shippingFee: Number(e.target.value) }))}
            className="input"
          />
        </Field>
      </div>

      <Field label="画像URL">
        <input
          value={values.imageUrl}
          onChange={(e) => setValues((p) => ({ ...p, imageUrl: e.target.value }))}
          className="input"
        />
      </Field>

      <Field label="スマレジ商品ID(紐付け用)">
        <input
          value={values.smaregiProductId}
          onChange={(e) => setValues((p) => ({ ...p, smaregiProductId: e.target.value }))}
          className="input"
        />
      </Field>

      <div>
        <span className="mb-2 block text-sm font-medium text-neutral-700">注文タイプ</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={values.orderType === "one_time"}
              onChange={() => setValues((p) => ({ ...p, orderType: "one_time" }))}
            />
            単品(単発購入のみ)
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={values.orderType === "subscription"}
              onChange={() => setValues((p) => ({ ...p, orderType: "subscription" }))}
            />
            定期(定期購入のみ)
          </label>
        </div>
        {values.orderType === "subscription" && (
          <div className="mt-2 flex gap-4 pl-6 text-sm">
            {(Object.keys(INTERVAL_LABELS) as SubscriptionInterval[]).map((interval) => (
              <label key={interval} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={values.subscriptionIntervals.includes(interval)}
                  onChange={() => toggleInterval(interval)}
                />
                {INTERVAL_LABELS[interval]}
              </label>
            ))}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {submitting ? "保存中..." : isEdit ? "更新する" : "登録する"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
