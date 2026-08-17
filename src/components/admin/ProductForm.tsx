"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import type { ComparePriceType, ProductOrderType, SubscriptionInterval } from "@/lib/types";

const COMPARE_PRICE_TYPE_LABELS: Record<ComparePriceType, string> = {
  none: "比較価格を表示しない",
  list_price: "通常価格",
  unit_total: "単品合計価格",
  custom: "その他(自由入力)",
};

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  biweekly: "2週間ごと",
  monthly: "1ヶ月ごと",
  bimonthly: "2ヶ月ごと",
  test_3day: "3日ごと(テスト用)",
};

export interface ProductFormValues {
  id?: string;
  productGroupId: string;
  name: string;
  description: string;
  memo: string;
  price: number;
  listPrice: number | null;
  firstTimePrice: number | null;
  comparePriceType: ComparePriceType;
  unitTotalPrice: number | null;
  customCompareLabel: string;
  customComparePrice: number | null;
  priceLabel: string;
  taxRate: 8 | 10;
  shippingFee: number;
  isMailDeliverable: boolean;
  imageUrls: string[];
  smaregiProductId: string;
  orderType: ProductOrderType;
  subscriptionIntervals: SubscriptionInterval[];
  isSet: boolean;
  setItemCount: number | null;
  setOptionProductIds: string[];
}

function emptyValues(defaultProductGroupId?: string): ProductFormValues {
  return {
    productGroupId: defaultProductGroupId ?? "",
    name: "",
    description: "",
    memo: "",
    price: 0,
    listPrice: null,
    firstTimePrice: null,
    comparePriceType: "none",
    unitTotalPrice: null,
    customCompareLabel: "",
    customComparePrice: null,
    priceLabel: "",
    taxRate: 8,
    shippingFee: 0,
    isMailDeliverable: false,
    imageUrls: [],
    smaregiProductId: "",
    orderType: "one_time",
    subscriptionIntervals: [],
    isSet: false,
    setItemCount: null,
    setOptionProductIds: [],
  };
}

export function ProductForm({
  initialValues,
  productGroups,
  otherProducts,
  lockProductGroup,
}: {
  initialValues?: ProductFormValues;
  productGroups: { id: string; name: string }[];
  otherProducts: { id: string; name: string }[];
  lockProductGroup?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(
    initialValues ?? emptyValues(productGroups[0]?.id),
  );
  const [submitting, setSubmitting] = useState(false);
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

  const isEdit = Boolean(values.id);

  function toggleInterval(interval: SubscriptionInterval) {
    setValues((prev) => ({
      ...prev,
      subscriptionIntervals: prev.subscriptionIntervals.includes(interval)
        ? prev.subscriptionIntervals.filter((i) => i !== interval)
        : [...prev.subscriptionIntervals, interval],
    }));
  }

  function toggleSetOption(productId: string) {
    setValues((prev) => ({
      ...prev,
      setOptionProductIds: prev.setOptionProductIds.includes(productId)
        ? prev.setOptionProductIds.filter((id) => id !== productId)
        : [...prev.setOptionProductIds, productId],
    }));
  }

  function moveSetOption(index: number, direction: -1 | 1) {
    setValues((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.setOptionProductIds.length) return prev;
      const next = [...prev.setOptionProductIds];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, setOptionProductIds: next };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);

    if (!values.productGroupId) {
      setSubmitting(false);
      setToast({ message: "アイテム(親品番)を選択してください", type: "error" });
      return;
    }
    if (values.orderType === "subscription" && values.subscriptionIntervals.length === 0) {
      setSubmitting(false);
      setToast({ message: "定期購入の場合は周期を1つ以上選択してください", type: "error" });
      return;
    }
    if (values.isSet) {
      if (!values.setItemCount || values.setItemCount < 1) {
        setSubmitting(false);
        setToast({ message: "セット構成数を入力してください", type: "error" });
        return;
      }
      if (values.setOptionProductIds.length === 0) {
        setSubmitting(false);
        setToast({ message: "選択肢の商品を1つ以上選択してください", type: "error" });
        return;
      }
    }

    const payload = {
      productGroupId: values.productGroupId,
      name: values.name,
      description: values.description || undefined,
      memo: values.memo || null,
      price: Number(values.price),
      listPrice: values.listPrice === null ? null : Number(values.listPrice),
      firstTimePrice:
        values.orderType === "subscription" && values.firstTimePrice !== null
          ? Number(values.firstTimePrice)
          : null,
      comparePriceType: values.comparePriceType,
      unitTotalPrice: values.unitTotalPrice === null ? null : Number(values.unitTotalPrice),
      customCompareLabel: values.customCompareLabel || null,
      customComparePrice: values.customComparePrice === null ? null : Number(values.customComparePrice),
      priceLabel: values.priceLabel || null,
      taxRate: values.taxRate,
      shippingFee: Number(values.shippingFee),
      isMailDeliverable: values.isMailDeliverable,
      imageUrls: values.imageUrls.map((u) => u.trim()).filter(Boolean),
      smaregiProductId: values.smaregiProductId || undefined,
      orderType: values.orderType,
      subscriptionIntervals: values.orderType === "subscription" ? values.subscriptionIntervals : [],
      isSet: values.isSet,
      setItemCount: values.isSet ? values.setItemCount : null,
      setOptionProductIds: values.isSet ? values.setOptionProductIds : [],
    };

    const res = await fetch(isEdit ? `/api/products/${values.id}` : "/api/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message:
          typeof body.error === "string" ? body.error : JSON.stringify(body.error ?? "登録に失敗しました"),
        type: "error",
      });
      return;
    }

    if (!isEdit) {
      router.push("/admin/products");
      router.refresh();
      return;
    }

    setJustSaved(true);
    setToast({ message: "保存しました", type: "success" });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <Field label="アイテム(親品番)">
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

      <Field label="消費税区分(スマレジ連携用)">
        <select
          value={values.taxRate}
          onChange={(e) => setValues((p) => ({ ...p, taxRate: Number(e.target.value) === 10 ? 10 : 8 }))}
          className="input"
        >
          <option value={8}>軽減税率(8%)</option>
          <option value={10}>標準税率(10%)</option>
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.isMailDeliverable}
          onChange={(e) => setValues((p) => ({ ...p, isMailDeliverable: e.target.checked }))}
        />
        ポスト投函対象(単品1点のみの注文ではお届け日・時間帯の指定を受け付けません)
      </label>

      <div className="rounded-md border border-neutral-200 p-3">
        <p className="mb-3 text-sm font-medium text-neutral-700">
          二重価格表記(任意): 比較価格を取り消し線で表示し、「ラベル特別価格」として上記の価格を強調表示します
        </p>
        <Field label="比較価格ラベル">
          <select
            value={values.comparePriceType}
            onChange={(e) => setValues((p) => ({ ...p, comparePriceType: e.target.value as ComparePriceType }))}
            className="input"
          >
            {(Object.keys(COMPARE_PRICE_TYPE_LABELS) as ComparePriceType[]).map((type) => (
              <option key={type} value={type}>
                {COMPARE_PRICE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        {values.comparePriceType === "list_price" && (
          <div className="mt-3">
            <Field label="通常価格(円)">
              <input
                type="number"
                min={0}
                value={values.listPrice ?? ""}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    listPrice: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="input"
              />
            </Field>
          </div>
        )}

        {values.comparePriceType === "unit_total" && (
          <div className="mt-3">
            <Field label="単品合計価格(円、構成品を個別に買った場合の合計金額を手入力)">
              <input
                type="number"
                min={0}
                value={values.unitTotalPrice ?? ""}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    unitTotalPrice: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="input"
              />
            </Field>
          </div>
        )}

        {values.comparePriceType === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Field label="ラベル文言(例: SNS限定価格)">
              <input
                value={values.customCompareLabel}
                onChange={(e) => setValues((p) => ({ ...p, customCompareLabel: e.target.value }))}
                className="input"
              />
            </Field>
            <Field label="金額(円)">
              <input
                type="number"
                min={0}
                value={values.customComparePrice ?? ""}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    customComparePrice: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="input"
              />
            </Field>
          </div>
        )}

        <div className="mt-3">
          <Field label="強調価格のラベル(例: 定期, おためし)">
            <input
              value={values.priceLabel}
              onChange={(e) => setValues((p) => ({ ...p, priceLabel: e.target.value }))}
              className="input"
            />
          </Field>
        </div>

        {(() => {
          const compareAmount =
            values.comparePriceType === "list_price"
              ? values.listPrice
              : values.comparePriceType === "unit_total"
                ? values.unitTotalPrice
                : values.comparePriceType === "custom"
                  ? values.customComparePrice
                  : null;
          const compareLabel =
            values.comparePriceType === "list_price"
              ? "通常価格"
              : values.comparePriceType === "unit_total"
                ? "単品合計価格"
                : values.customCompareLabel || "比較価格";
          if (compareAmount === null || compareAmount <= values.price) return null;
          return (
            <p className="mt-2 text-xs text-neutral-500">
              表示例: {compareLabel} <span className="line-through">{compareAmount.toLocaleString()}円</span>
              {" → "}
              {values.priceLabel || "特別"}価格 {values.price.toLocaleString()}円
            </p>
          );
        })()}
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700">
          画像URL(複数可、1枚目がカルーセルに表示されます)
        </span>
        <p className="mb-1 text-xs text-neutral-400">推奨比率: 正方形(1:1)。商品カード・詳細ともに正方形に切り取られて表示されます</p>
        <div className="space-y-2">
          {values.imageUrls.map((url, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={url}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    imageUrls: p.imageUrls.map((u, i) => (i === index ? e.target.value : u)),
                  }))
                }
                className="input"
              />
              <button
                type="button"
                onClick={() =>
                  setValues((p) => ({ ...p, imageUrls: p.imageUrls.filter((_, i) => i !== index) }))
                }
                className="shrink-0 rounded-md border border-neutral-300 px-3 text-sm hover:bg-neutral-50"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setValues((p) => ({ ...p, imageUrls: [...p.imageUrls, ""] }))}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          + 画像URLを追加
        </button>
      </div>

      <Field label="スマレジ商品ID(紐付け用)">
        <input
          value={values.smaregiProductId}
          onChange={(e) => setValues((p) => ({ ...p, smaregiProductId: e.target.value }))}
          className="input"
        />
      </Field>

      <Field label="備考(社内用・任意)">
        <p className="mb-1 text-xs text-neutral-400">チャット画面には表示されません。</p>
        <textarea
          value={values.memo}
          onChange={(e) => setValues((p) => ({ ...p, memo: e.target.value }))}
          rows={3}
          className="input"
        />
      </Field>

      <div className="rounded-md border border-neutral-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <input
            type="checkbox"
            checked={values.isSet}
            onChange={(e) => setValues((p) => ({ ...p, isSet: e.target.checked }))}
          />
          セット品として販売する(お客様が内訳を選ぶ商品)
        </label>
        {values.isSet && (
          <div className="mt-3 space-y-3">
            <Field label="セット構成数(お客様が選ぶ点数)">
              <input
                type="number"
                min={1}
                value={values.setItemCount ?? ""}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    setItemCount: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="input max-w-[8rem]"
              />
            </Field>
            <div>
              <span className="mb-1 block text-sm font-medium text-neutral-700">
                選択肢として提示する商品品番
              </span>
              <p className="mb-2 text-xs text-neutral-400">
                選択中: {values.setOptionProductIds.length}点(同じ商品を複数回選べるため、選択肢の数が構成数より少なくてもかまいません)
              </p>
              {values.setOptionProductIds.length > 0 && (
                <div className="mb-2 space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-2">
                  <p className="text-xs font-medium text-neutral-500">選択中(内訳ギャラリーの表示順)</p>
                  {values.setOptionProductIds.map((id, index) => {
                    const product = otherProducts.find((p) => p.id === id);
                    return (
                      <div key={`${id}-${index}`} className="flex items-center gap-2 text-xs">
                        <span className="w-5 text-center font-medium text-neutral-400">{index + 1}</span>
                        <span className="flex-1 truncate">{product?.name ?? id}</span>
                        <button
                          type="button"
                          onClick={() => moveSetOption(index, -1)}
                          disabled={index === 0}
                          className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSetOption(index, 1)}
                          disabled={index === values.setOptionProductIds.length - 1}
                          className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-neutral-200 p-2">
                {otherProducts.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={values.setOptionProductIds.includes(p.id)}
                      onChange={() => toggleSetOption(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
                {otherProducts.length === 0 && (
                  <p className="text-sm text-neutral-400">選択肢にできる他の品番がありません</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

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
        {values.orderType === "subscription" && (
          <div className="mt-3 pl-6">
            <Field label="初回価格(任意、2回目以降は通常価格に戻ります)">
              <input
                type="number"
                min={0}
                value={values.firstTimePrice ?? ""}
                onChange={(e) =>
                  setValues((p) => ({
                    ...p,
                    firstTimePrice: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                className="w-40 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                placeholder="未設定(初回も通常価格)"
              />
            </Field>
            {values.firstTimePrice !== null && values.firstTimePrice < values.price && (
              <p className="mt-1 text-xs text-neutral-500">
                初回 {values.firstTimePrice.toLocaleString()}円 → 2回目以降 {values.price.toLocaleString()}円
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {submitting ? "保存中..." : justSaved ? "保存済み" : isEdit ? "更新する" : "登録する"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          キャンセル
        </button>
      </div>
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
