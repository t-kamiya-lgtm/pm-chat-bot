"use client";

import { useEffect, useState } from "react";
import type { PaymentMethod, SubscriptionInterval } from "@/lib/types";
import type { WidgetProduct } from "@/components/chat/types";
import { AmountBreakdown } from "@/components/chat/AmountBreakdown";
import { StripePaymentForm } from "@/components/chat/StripePaymentForm";
import {
  CHECKOUT_FIELD_LABELS,
  DEFAULT_CHECKOUT_FIELD_ORDER,
  type CheckoutFieldKey,
} from "@/lib/checkout-fields";

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  biweekly: "2週間ごと",
  monthly: "1ヶ月ごと",
  bimonthly: "2ヶ月ごと",
};

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string; description: string }[] = [
  {
    value: "stripe",
    label: "クレジットカード / Apple Pay / Google Pay / PayPay",
    description: "画面内でそのままお支払いいただけます",
  },
  {
    value: "deferred_invoice",
    label: "後払い(郵便局・コンビニ後払い)",
    description: "商品と一緒に届く請求書でお支払いいただけます",
  },
  {
    value: "cod",
    label: "代金引換",
    description: "商品お届け時に配送員へお支払いいただけます",
  },
];

function validateField(key: CheckoutFieldKey, value: string): string | null {
  const trimmed = value.trim();
  switch (key) {
    case "name":
      return trimmed ? null : "お名前を入力してください";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
        ? null
        : "正しいメールアドレスを入力してください";
    case "phone":
      return null;
    case "postalCode":
      return /^\d{7}$/.test(value.replace(/[^0-9]/g, ""))
        ? null
        : "郵便番号は7桁の数字で入力してください";
    case "prefecture":
      return trimmed ? null : "都道府県を入力してください";
    case "city":
      return trimmed ? null : "市区町村を入力してください";
    case "line1":
      return trimmed ? null : "番地・建物名を入力してください";
    default:
      return null;
  }
}

interface Props {
  product: WidgetProduct;
  onComplete: (result: { ok: boolean; message: string }) => void;
  onBack: () => void;
}

type Stage = "options" | "wizard";

export function CheckoutForm({ product, onComplete, onBack }: Props) {
  const orderType = product.order_type;
  const [stage, setStage] = useState<Stage>("options");
  const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>(
    product.subscription_intervals[0] ?? "monthly",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [paymentFee, setPaymentFee] = useState(0);

  const [fieldOrder, setFieldOrder] = useState<CheckoutFieldKey[]>(DEFAULT_CHECKOUT_FIELD_ORDER);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<CheckoutFieldKey, string>>({
    name: "",
    email: "",
    phone: "",
    postalCode: "",
    prefecture: "",
    city: "",
    line1: "",
  });
  const [touched, setTouched] = useState<Partial<Record<CheckoutFieldKey, boolean>>>({});
  const [addressLookupStatus, setAddressLookupStatus] = useState<"idle" | "loading" | "not_found">(
    "idle",
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/widget/checkout-fields")
      .then((res) => res.json())
      .then((body: { order?: CheckoutFieldKey[] }) => {
        if (body.order) setFieldOrder(body.order);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ paymentMethod, orderType });
    fetch(`/api/widget/fees?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => setPaymentFee(body.fee ?? 0))
      .catch(() => setPaymentFee(0));
  }, [paymentMethod, orderType]);

  useEffect(() => {
    const digitsOnly = values.postalCode.replace(/[^0-9]/g, "");
    if (digitsOnly.length !== 7) return;

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (!cancelled) setAddressLookupStatus("loading");
      })
      .then(() => fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digitsOnly}`))
      .then((res) => res.json())
      .then((body: { results?: { address1: string; address2: string }[] }) => {
        if (cancelled) return;
        const result = body.results?.[0];
        if (result) {
          setValues((prev) => ({ ...prev, prefecture: result.address1, city: result.address2 }));
          setAddressLookupStatus("idle");
        } else {
          setAddressLookupStatus("not_found");
        }
      })
      .catch(() => {
        if (!cancelled) setAddressLookupStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [values.postalCode]);

  async function submitOrder() {
    setError(null);
    setSubmitting(true);

    const customer = {
      name: values.name,
      email: values.email,
      phone: values.phone || undefined,
      address: {
        postalCode: values.postalCode,
        prefecture: values.prefecture,
        city: values.city,
        line1: values.line1,
      },
    };

    try {
      if (paymentMethod === "stripe") {
        const endpoint =
          orderType === "subscription" ? "/api/checkout/subscription" : "/api/checkout/payment-intent";
        const body =
          orderType === "subscription"
            ? { productId: product.id, subscriptionInterval, customer }
            : { productId: product.id, customer };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "決済の準備に失敗しました");

        setClientSecret(data.clientSecret);
      } else {
        const res = await fetch("/api/checkout/deferred", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            orderType,
            subscriptionInterval: orderType === "subscription" ? subscriptionInterval : undefined,
            paymentMethod,
            customer,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "注文の受付に失敗しました");

        onComplete({
          ok: data.accepted,
          message: data.accepted
            ? "ご注文を受け付けました。詳しいお支払い方法は追ってご案内します。"
            : "ご注文の受付に失敗しました。恐れ入りますが再度お試しください。",
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNextStep() {
    const key = fieldOrder[stepIndex];
    const errorMsg = validateField(key, values[key]);
    if (errorMsg) {
      setTouched((prev) => ({ ...prev, [key]: true }));
      return;
    }

    if (stepIndex === fieldOrder.length - 1) {
      submitOrder();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBackStep() {
    if (stepIndex === 0) {
      setStage("options");
    } else {
      setStepIndex((i) => i - 1);
    }
  }

  if (clientSecret) {
    return (
      <StripePaymentForm
        clientSecret={clientSecret}
        onSuccess={() =>
          onComplete({ ok: true, message: "お支払いが完了しました。ありがとうございます。" })
        }
        onError={(message) => setError(message)}
      />
    );
  }

  if (stage === "wizard") {
    const key = fieldOrder[stepIndex];
    const value = values[key];
    const errorMsg = validateField(key, value);
    const showError = touched[key] && errorMsg;
    const isLastStep = stepIndex === fieldOrder.length - 1;

    return (
      <div className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <button type="button" onClick={handleBackStep} className="hover:text-neutral-600">
            ← 戻る
          </button>
          <span>
            {stepIndex + 1} / {fieldOrder.length}
          </span>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">
            {CHECKOUT_FIELD_LABELS[key]}
            {key === "phone" && "(任意)"}
          </span>
          <input
            autoFocus
            type={key === "email" ? "email" : "text"}
            className="input"
            value={value}
            onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
            onBlur={() => setTouched((prev) => ({ ...prev, [key]: true }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleNextStep();
              }
            }}
            placeholder={key === "postalCode" ? "ハイフンなしでも可" : undefined}
          />
          {key === "postalCode" && addressLookupStatus === "loading" && (
            <p className="mt-1 text-xs text-neutral-400">住所を検索中...</p>
          )}
          {key === "postalCode" && addressLookupStatus === "not_found" && (
            <p className="mt-1 text-xs text-neutral-400">
              住所が見つかりませんでした。都道府県以下は次の質問で入力してください。
            </p>
          )}
          {showError && <p className="mt-1 text-xs text-red-600">{errorMsg}</p>}
        </label>

        <button
          type="button"
          onClick={handleNextStep}
          disabled={submitting}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {submitting ? "処理中..." : isLastStep ? "この内容で注文する" : "次へ"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium">{product.name} のご注文</p>
        <button type="button" onClick={onBack} className="text-xs text-neutral-400 hover:text-neutral-600">
          ← 戻る
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {orderType === "subscription" && (
        <select
          className="input"
          value={subscriptionInterval}
          onChange={(e) => setSubscriptionInterval(e.target.value as SubscriptionInterval)}
        >
          {product.subscription_intervals.map((interval) => (
            <option key={interval} value={interval}>
              {INTERVAL_LABELS[interval]}
            </option>
          ))}
        </select>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-neutral-700">お支払い方法</p>
        {PAYMENT_METHOD_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
              paymentMethod === option.value ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
            }`}
          >
            <input
              type="radio"
              className="mt-1"
              checked={paymentMethod === option.value}
              onChange={() => setPaymentMethod(option.value)}
            />
            <span>
              <span className="block">{option.label}</span>
              <span className="block text-xs text-neutral-500">{option.description}</span>
            </span>
          </label>
        ))}
      </div>

      <AmountBreakdown
        amount={product.price}
        shippingFee={product.shipping_fee}
        paymentFee={paymentFee}
        paymentFeeLabel={paymentMethod === "cod" ? "代引手数料" : "後払い手数料"}
      />

      <button
        type="button"
        onClick={() => setStage("wizard")}
        className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
      >
        次へ
      </button>
    </div>
  );
}
