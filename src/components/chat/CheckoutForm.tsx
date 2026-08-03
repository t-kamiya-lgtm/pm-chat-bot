"use client";

import { useEffect, useState } from "react";
import type { PaymentMethod, SubscriptionInterval } from "@/lib/types";
import type { WidgetProduct } from "@/components/chat/types";
import { AmountBreakdown } from "@/components/chat/AmountBreakdown";
import { StripePaymentForm } from "@/components/chat/StripePaymentForm";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  ADDRESS_FIELD_KEYS,
  ADDRESS_KEY_SET,
  CHECKOUT_FIELD_LABELS,
  DEFAULT_CHECKOUT_FIELD_ORDER,
  DELIVERY_FIELD_KEYS,
  DELIVERY_KEY_SET,
  DELIVERY_TIME_SLOTS,
  MIN_DELIVERY_LEAD_DAYS,
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

function minDeliveryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + MIN_DELIVERY_LEAD_DAYS);
  return d.toISOString().slice(0, 10);
}

type WizardStep =
  | { kind: "field"; key: CheckoutFieldKey }
  | { kind: "address" }
  | { kind: "delivery" };

/** 住所4項目・お届け希望日時2項目はそれぞれ1画面にまとめて表示する(それ以外は1問1答)。 */
function buildWizardSteps(order: CheckoutFieldKey[]): WizardStep[] {
  const steps: WizardStep[] = [];
  let addressAdded = false;
  let deliveryAdded = false;
  for (const key of order) {
    if (ADDRESS_KEY_SET.has(key)) {
      if (!addressAdded) {
        steps.push({ kind: "address" });
        addressAdded = true;
      }
    } else if (DELIVERY_KEY_SET.has(key)) {
      if (!deliveryAdded) {
        steps.push({ kind: "delivery" });
        deliveryAdded = true;
      }
    } else {
      steps.push({ kind: "field", key });
    }
  }
  return steps;
}

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
      if (!trimmed) return null;
      return /^0\d{9,10}$/.test(trimmed.replace(/[^0-9]/g, ""))
        ? null
        : "正しい電話番号を入力してください(ハイフンなし10〜11桁)";
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
    case "deliveryDate":
      if (!trimmed) return "お届け希望日を選択してください";
      return trimmed >= minDeliveryDate() ? null : `お届け希望日は本日から${MIN_DELIVERY_LEAD_DAYS}日後以降を指定してください`;
    case "deliveryTimeSlot":
      return (DELIVERY_TIME_SLOTS as readonly string[]).includes(trimmed)
        ? null
        : "お届け希望時間帯を選択してください";
    default:
      return null;
  }
}

function stepQuestionText(step: WizardStep): string {
  if (step.kind === "address") return "お届け先の住所を教えてください。";
  if (step.kind === "delivery") return "お届け希望日・時間帯を教えてください。";
  return `${CHECKOUT_FIELD_LABELS[step.key]}を教えてください。${step.key === "phone" ? "(任意)" : ""}`;
}

function stepAnswerText(step: WizardStep, values: Record<CheckoutFieldKey, string>): string {
  if (step.kind === "address") {
    return `〒${values.postalCode} ${values.prefecture}${values.city}${values.line1}`;
  }
  if (step.kind === "delivery") {
    return `${values.deliveryDate || "(未指定)"} ${values.deliveryTimeSlot || ""}`.trim();
  }
  return values[step.key] || "(未入力)";
}

interface Props {
  product: WidgetProduct;
  greeting?: string;
  completionMessage?: string;
  termsText?: string;
  privacyText?: string;
  onComplete: (result: { ok: boolean; message: string }) => void;
  onBack: () => void;
}

type Stage = "options" | "wizard" | "confirm";

export function CheckoutForm({
  product,
  greeting,
  completionMessage,
  termsText,
  privacyText,
  onComplete,
  onBack,
}: Props) {
  const orderType = product.order_type;
  const [stage, setStage] = useState<Stage>("options");
  const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>(
    product.subscription_intervals[0] ?? "monthly",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [paymentFee, setPaymentFee] = useState(0);

  const [fieldOrder, setFieldOrder] = useState<CheckoutFieldKey[]>(DEFAULT_CHECKOUT_FIELD_ORDER);
  const steps = buildWizardSteps(fieldOrder);
  const [stepIndex, setStepIndex] = useState(0);
  const [returningToConfirm, setReturningToConfirm] = useState(false);
  const [values, setValues] = useState<Record<CheckoutFieldKey, string>>({
    name: "",
    email: "",
    phone: "",
    postalCode: "",
    prefecture: "",
    city: "",
    line1: "",
    deliveryDate: "",
    deliveryTimeSlot: "",
  });
  const [touched, setTouched] = useState<Partial<Record<CheckoutFieldKey, boolean>>>({});
  const [addressLookupStatus, setAddressLookupStatus] = useState<"idle" | "loading" | "not_found">(
    "idle",
  );
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

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
    if (!agreedTerms || !agreedPrivacy) {
      setError("特定商取引法に基づく表記・個人情報の取り扱いについてに同意のうえお進みください");
      return;
    }

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
    const delivery = {
      deliveryDate: values.deliveryDate,
      deliveryTimeSlot: values.deliveryTimeSlot,
      agreedTerms: true as const,
      agreedPrivacy: true as const,
    };

    try {
      if (paymentMethod === "stripe") {
        const endpoint =
          orderType === "subscription" ? "/api/checkout/subscription" : "/api/checkout/payment-intent";
        const body =
          orderType === "subscription"
            ? { productId: product.id, subscriptionInterval, customer, ...delivery }
            : { productId: product.id, customer, ...delivery };

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
            ...delivery,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "注文の受付に失敗しました");

        onComplete({
          ok: data.accepted,
          message: data.accepted
            ? completionMessage || "ご注文を受け付けました。詳しいお支払い方法は追ってご案内します。"
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
    const step = steps[stepIndex];
    const keysToValidate =
      step.kind === "address" ? ADDRESS_FIELD_KEYS : step.kind === "delivery" ? DELIVERY_FIELD_KEYS : [step.key];
    const hasError = keysToValidate.some((key) => validateField(key, values[key]));
    if (hasError) {
      setTouched((prev) => {
        const next = { ...prev };
        for (const key of keysToValidate) next[key] = true;
        return next;
      });
      return;
    }

    if (returningToConfirm || stepIndex === steps.length - 1) {
      setReturningToConfirm(false);
      setStage("confirm");
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBackStep() {
    if (returningToConfirm) {
      setReturningToConfirm(false);
      setStage("confirm");
      return;
    }
    if (stepIndex === 0) {
      setStage("options");
    } else {
      setStepIndex((i) => i - 1);
    }
  }

  function goToStep(index: number) {
    setStepIndex(index);
    setStage("wizard");
    setReturningToConfirm(true);
  }

  if (clientSecret) {
    return (
      <StripePaymentForm
        clientSecret={clientSecret}
        onSuccess={() =>
          onComplete({
            ok: true,
            message: completionMessage || "お支払いが完了しました。ありがとうございます。",
          })
        }
        onError={(message) => setError(message)}
      />
    );
  }

  if (stage === "wizard") {
    const step = steps[stepIndex];
    const isLastStep = stepIndex === steps.length - 1;

    return (
      <div className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <button type="button" onClick={handleBackStep} className="hover:text-neutral-600">
            ← 戻る
          </button>
          <span>
            {stepIndex + 1} / {steps.length}
          </span>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {steps.slice(0, stepIndex).map((pastStep, idx) => (
            <div key={idx} className="space-y-1">
              <MessageBubble
                message={{ id: `q-${idx}`, from: "bot", kind: "text", text: stepQuestionText(pastStep) }}
              />
              <MessageBubble
                message={{
                  id: `a-${idx}`,
                  from: "user",
                  kind: "text",
                  text: stepAnswerText(pastStep, values),
                }}
              />
            </div>
          ))}
          <MessageBubble
            message={{ id: "current-q", from: "bot", kind: "text", text: stepQuestionText(step) }}
          />
        </div>

        {step.kind === "address" ? (
          <div className="space-y-3">
            {ADDRESS_FIELD_KEYS.map((key) => {
              const errorMsg = validateField(key, values[key]);
              const showError = touched[key] && errorMsg;
              return (
                <label key={key} className="block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">
                    {CHECKOUT_FIELD_LABELS[key]}
                  </span>
                  <input
                    autoFocus={key === "postalCode"}
                    type="text"
                    className="input"
                    value={values[key]}
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
                      住所が見つかりませんでした。都道府県以下は下の欄に入力してください。
                    </p>
                  )}
                  {showError && <p className="mt-1 text-xs text-red-600">{errorMsg}</p>}
                </label>
              );
            })}
          </div>
        ) : step.kind === "delivery" ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">お届け希望日</span>
              <input
                autoFocus
                type="date"
                className="input"
                min={minDeliveryDate()}
                value={values.deliveryDate}
                onChange={(e) => setValues((prev) => ({ ...prev, deliveryDate: e.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, deliveryDate: true }))}
              />
              {touched.deliveryDate && validateField("deliveryDate", values.deliveryDate) && (
                <p className="mt-1 text-xs text-red-600">
                  {validateField("deliveryDate", values.deliveryDate)}
                </p>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">お届け希望時間帯</span>
              <select
                className="input"
                value={values.deliveryTimeSlot}
                onChange={(e) => setValues((prev) => ({ ...prev, deliveryTimeSlot: e.target.value }))}
                onBlur={() => setTouched((prev) => ({ ...prev, deliveryTimeSlot: true }))}
              >
                <option value="">選択してください</option>
                {DELIVERY_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
              {touched.deliveryTimeSlot && validateField("deliveryTimeSlot", values.deliveryTimeSlot) && (
                <p className="mt-1 text-xs text-red-600">
                  {validateField("deliveryTimeSlot", values.deliveryTimeSlot)}
                </p>
              )}
            </label>
          </div>
        ) : (
          <label className="block">
            <input
              autoFocus
              type={step.key === "email" ? "email" : "text"}
              className="input"
              value={values[step.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [step.key]: e.target.value }))}
              onBlur={() => setTouched((prev) => ({ ...prev, [step.key]: true }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleNextStep();
                }
              }}
            />
            {touched[step.key] && validateField(step.key, values[step.key]) && (
              <p className="mt-1 text-xs text-red-600">
                {validateField(step.key, values[step.key])}
              </p>
            )}
          </label>
        )}

        <button
          type="button"
          onClick={handleNextStep}
          disabled={submitting}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {isLastStep ? "入力内容を確認する" : "次へ"}
        </button>
      </div>
    );
  }

  if (stage === "confirm") {
    const canSubmit = agreedTerms && agreedPrivacy;

    return (
      <div className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium">ご注文内容の確認</p>
          <button
            type="button"
            onClick={() => goToStep(steps.length - 1)}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            ← 戻る
          </button>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        <div className="space-y-2 rounded-md border border-neutral-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">お支払い方法</span>
            <div className="flex items-center gap-2">
              <span>{PAYMENT_METHOD_OPTIONS.find((o) => o.value === paymentMethod)?.label}</span>
              <button
                type="button"
                onClick={() => {
                  setReturningToConfirm(true);
                  setStage("options");
                }}
                className="text-xs text-blue-600 hover:underline"
              >
                編集
              </button>
            </div>
          </div>
          {orderType === "subscription" && (
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">お届け周期</span>
              <div className="flex items-center gap-2">
                <span>{INTERVAL_LABELS[subscriptionInterval]}</span>
                <button
                  type="button"
                  onClick={() => {
                    setReturningToConfirm(true);
                    setStage("options");
                  }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  編集
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-neutral-200 p-3 text-sm">
          {steps.map((step, idx) => (
            <div
              key={step.kind === "field" ? step.key : step.kind}
              className="flex items-start justify-between gap-3"
            >
              <span className="shrink-0 text-neutral-500">
                {step.kind === "address"
                  ? "お届け先住所"
                  : step.kind === "delivery"
                    ? "お届け希望日・時間帯"
                    : CHECKOUT_FIELD_LABELS[step.key]}
              </span>
              <div className="flex items-start gap-2 text-right">
                <span>{stepAnswerText(step, values)}</span>
                <button
                  type="button"
                  onClick={() => goToStep(idx)}
                  className="shrink-0 text-xs text-blue-600 hover:underline"
                >
                  編集
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-md border border-neutral-200 p-3 text-sm">
          <div>
            <p className="mb-1 font-medium text-neutral-700">特定商取引法に基づく表記</p>
            {termsText && (
              <div className="max-h-32 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-2 text-xs whitespace-pre-wrap">
                {termsText}
              </div>
            )}
            <label className="mt-2 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
              />
              <span>内容を確認しました</span>
            </label>
          </div>
          <div>
            <p className="mb-1 font-medium text-neutral-700">個人情報の取り扱いについて</p>
            {privacyText && (
              <div className="max-h-32 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-2 text-xs whitespace-pre-wrap">
                {privacyText}
              </div>
            )}
            <label className="mt-2 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
              />
              <span>同意します</span>
            </label>
          </div>
        </div>

        <AmountBreakdown
          amount={product.price}
          shippingFee={product.shipping_fee}
          paymentFee={paymentFee}
          paymentFeeLabel={paymentMethod === "cod" ? "代引手数料" : "後払い手数料"}
        />

        <button
          type="button"
          onClick={submitOrder}
          disabled={submitting || !canSubmit}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {submitting ? "処理中..." : "この内容で注文を確定する"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {greeting && <MessageBubble message={{ id: "greeting", from: "bot", kind: "text", text: greeting }} />}

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

        <MessageBubble
          message={{ id: "payment-prompt", from: "bot", kind: "text", text: "次に決済方法をお選びください。" }}
        />

        <div className="space-y-2">
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
          onClick={() => {
            if (returningToConfirm) {
              setReturningToConfirm(false);
              setStage("confirm");
            } else {
              setStepIndex(0);
              setStage("wizard");
            }
          }}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
        >
          次へ
        </button>
      </div>
    </div>
  );
}
