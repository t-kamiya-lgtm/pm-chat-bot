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

const SHIPPING_ADDRESS_FIELD_KEYS = ["postalCode", "prefecture", "city", "line1"] as const;
type ShippingAddressFieldKey = (typeof SHIPPING_ADDRESS_FIELD_KEYS)[number];
type ShippingFieldKey = "recipientName" | "recipientPhone" | ShippingAddressFieldKey;
const SHIPPING_FIELD_KEYS: ShippingFieldKey[] = [
  "recipientName",
  "recipientPhone",
  ...SHIPPING_ADDRESS_FIELD_KEYS,
];

/** モバイルでキーボード表示時に入力欄が隠れないよう、フォーカス時に画面中央へスクロールする。 */
function scrollFieldIntoView(e: React.FocusEvent<HTMLElement>) {
  const target = e.target;
  setTimeout(() => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
}

const OFFER_COMMENT_MAX_LENGTH = 40;

/** アップセル/クロスセルの案内文はレイアウト崩れを防ぐため文字数を制限する。 */
function truncateOfferComment(text: string): string {
  return text.length > OFFER_COMMENT_MAX_LENGTH
    ? `${text.slice(0, OFFER_COMMENT_MAX_LENGTH)}…`
    : text;
}

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
    case "paymentMethod":
      return null;
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

function validateShippingField(key: ShippingFieldKey, value: string): string | null {
  const trimmed = value.trim();
  switch (key) {
    case "recipientName":
      return trimmed ? null : "お届け先のお名前を入力してください";
    case "recipientPhone":
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
    default:
      return null;
  }
}

function stepQuestionText(step: WizardStep): string {
  if (step.kind === "address") return "お届け先の住所を教えてください。";
  if (step.kind === "delivery") return "お届け希望日・時間帯を教えてください。";
  if (step.key === "paymentMethod") return "お支払い方法をお選びください。";
  return `${CHECKOUT_FIELD_LABELS[step.key]}を教えてください。${step.key === "phone" ? "(任意)" : ""}`;
}

interface ShippingSummary {
  enabled: boolean;
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
}

function stepAnswerText(
  step: WizardStep,
  values: Record<CheckoutFieldKey, string>,
  shipping?: ShippingSummary,
): string {
  if (step.kind === "address") {
    const base = `〒${values.postalCode} ${values.prefecture}${values.city}${values.line1}`;
    if (shipping?.enabled) {
      return `${base}(お届け先: ${shipping.recipientName}(${shipping.recipientPhone}) 〒${shipping.postalCode} ${shipping.prefecture}${shipping.city}${shipping.line1})`;
    }
    return base;
  }
  if (step.kind === "delivery") {
    return `${values.deliveryDate || "(未指定)"} ${values.deliveryTimeSlot || ""}`.trim();
  }
  if (step.key === "paymentMethod") {
    return PAYMENT_METHOD_OPTIONS.find((o) => o.value === values.paymentMethod)?.label ?? "(未選択)";
  }
  return values[step.key] || "(未入力)";
}

interface GreetingItem {
  type: "image" | "text";
  imageUrl?: string;
  linkUrl?: string;
  text?: string;
}

interface Props {
  product: WidgetProduct;
  upsellProduct?: WidgetProduct;
  upsellImageUrl?: string;
  upsellComment?: string;
  crossSellProduct?: WidgetProduct;
  crossSellImageUrl?: string;
  crossSellComment?: string;
  completionItems?: GreetingItem[];
  termsText?: string;
  privacyText?: string;
  sessionId: string;
  surveyResponses?: Record<string, string>;
  onComplete: (result: { ok: boolean; items: GreetingItem[] }) => void;
  onBack: () => void;
}

type Stage = "options" | "wizard" | "review" | "agreement";

const DEFAULT_SUCCESS_ITEMS: GreetingItem[] = [
  { type: "text", text: "お支払いが完了しました。ありがとうございます。" },
];
const DEFAULT_ACCEPTED_ITEMS: GreetingItem[] = [
  { type: "text", text: "ご注文を受け付けました。詳しいお支払い方法は追ってご案内します。" },
];
const FAILED_ITEMS: GreetingItem[] = [
  { type: "text", text: "ご注文の受付に失敗しました。恐れ入りますが再度お試しください。" },
];

export function CheckoutForm({
  product,
  upsellProduct,
  upsellImageUrl,
  upsellComment,
  crossSellProduct,
  crossSellImageUrl,
  crossSellComment,
  completionItems,
  termsText,
  privacyText,
  sessionId,
  surveyResponses,
  onComplete,
  onBack,
}: Props) {
  const [activeProduct, setActiveProduct] = useState<WidgetProduct>(product);
  const [addonSelected, setAddonSelected] = useState(false);
  const orderType = activeProduct.order_type;
  const [stage, setStage] = useState<Stage>("options");
  const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>(
    activeProduct.subscription_intervals[0] ?? "monthly",
  );
  const [methodFees, setMethodFees] = useState<Record<PaymentMethod, number>>({
    stripe: 0,
    deferred_invoice: 0,
    cod: 0,
  });

  const [fieldOrder, setFieldOrder] = useState<CheckoutFieldKey[]>(DEFAULT_CHECKOUT_FIELD_ORDER);
  const steps = buildWizardSteps(fieldOrder);
  const [stepIndex, setStepIndex] = useState(0);
  const [returningToConfirm, setReturningToConfirm] = useState(false);
  const [values, setValues] = useState<Record<CheckoutFieldKey, string>>({
    paymentMethod: "stripe",
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
  const paymentMethod = values.paymentMethod as PaymentMethod;
  const paymentFee = methodFees[paymentMethod] ?? 0;
  const [touched, setTouched] = useState<Partial<Record<CheckoutFieldKey, boolean>>>({});
  const [addressLookupStatus, setAddressLookupStatus] = useState<"idle" | "loading" | "not_found">(
    "idle",
  );

  const [shipToDifferentAddress, setShipToDifferentAddress] = useState(false);
  const [shippingValues, setShippingValues] = useState<Record<ShippingFieldKey, string>>({
    recipientName: "",
    recipientPhone: "",
    postalCode: "",
    prefecture: "",
    city: "",
    line1: "",
  });
  const [shippingTouched, setShippingTouched] = useState<Partial<Record<ShippingFieldKey, boolean>>>({});
  const [shippingAddressLookupStatus, setShippingAddressLookupStatus] = useState<
    "idle" | "loading" | "not_found"
  >("idle");

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
    let cancelled = false;
    Promise.all(
      (["stripe", "deferred_invoice", "cod"] as PaymentMethod[]).map((method) =>
        fetch(`/api/widget/fees?${new URLSearchParams({ paymentMethod: method, orderType }).toString()}`)
          .then((res) => res.json())
          .then((body) => [method, body.fee ?? 0] as const)
          .catch(() => [method, 0] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setMethodFees(Object.fromEntries(entries) as Record<PaymentMethod, number>);
    });
    return () => {
      cancelled = true;
    };
  }, [orderType]);

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

  useEffect(() => {
    if (!shipToDifferentAddress) return;
    const digitsOnly = shippingValues.postalCode.replace(/[^0-9]/g, "");
    if (digitsOnly.length !== 7) return;

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (!cancelled) setShippingAddressLookupStatus("loading");
      })
      .then(() => fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digitsOnly}`))
      .then((res) => res.json())
      .then((body: { results?: { address1: string; address2: string }[] }) => {
        if (cancelled) return;
        const result = body.results?.[0];
        if (result) {
          setShippingValues((prev) => ({ ...prev, prefecture: result.address1, city: result.address2 }));
          setShippingAddressLookupStatus("idle");
        } else {
          setShippingAddressLookupStatus("not_found");
        }
      })
      .catch(() => {
        if (!cancelled) setShippingAddressLookupStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [shippingValues.postalCode, shipToDifferentAddress]);

  function captureLead() {
    const hasAny = values.name.trim() || values.phone.trim() || values.email.trim();
    if (!hasAny) return;
    fetch("/api/widget/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        name: values.name.trim() || undefined,
        phone: values.phone.trim() || undefined,
        email: values.email.trim() || undefined,
        productId: activeProduct.id,
      }),
    }).catch(() => {});
  }

  function handleUpsellSelect() {
    if (!upsellProduct) return;
    setActiveProduct(upsellProduct);
    setSubscriptionInterval(upsellProduct.subscription_intervals[0] ?? "monthly");
  }

  function handleUpsellRevert() {
    setActiveProduct(product);
    setSubscriptionInterval(product.subscription_intervals[0] ?? "monthly");
  }

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
    const addonProductId =
      addonSelected && crossSellProduct ? crossSellProduct.id : undefined;
    const shippingAddress = shipToDifferentAddress
      ? {
          recipientName: shippingValues.recipientName,
          recipientPhone: shippingValues.recipientPhone,
          postalCode: shippingValues.postalCode,
          prefecture: shippingValues.prefecture,
          city: shippingValues.city,
          line1: shippingValues.line1,
        }
      : undefined;

    try {
      if (paymentMethod === "stripe") {
        const endpoint =
          orderType === "subscription" ? "/api/checkout/subscription" : "/api/checkout/payment-intent";
        const surveyResponsesPayload =
          surveyResponses && Object.keys(surveyResponses).length > 0 ? surveyResponses : undefined;
        const body =
          orderType === "subscription"
            ? {
                productId: activeProduct.id,
                subscriptionInterval,
                customer,
                ...delivery,
                ...(addonProductId && { addonProductId }),
                ...(shippingAddress && { shippingAddress }),
                ...(surveyResponsesPayload && { surveyResponses: surveyResponsesPayload }),
              }
            : {
                productId: activeProduct.id,
                customer,
                ...delivery,
                ...(addonProductId && { addonProductId }),
                ...(shippingAddress && { shippingAddress }),
                ...(surveyResponsesPayload && { surveyResponses: surveyResponsesPayload }),
              };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "決済の準備に失敗しました");
        if (!data.clientSecret) throw new Error("決済の準備に失敗しました(client secret missing)");

        setClientSecret(data.clientSecret);
      } else {
        const res = await fetch("/api/checkout/deferred", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productId: activeProduct.id,
            orderType,
            subscriptionInterval: orderType === "subscription" ? subscriptionInterval : undefined,
            paymentMethod,
            customer,
            ...delivery,
            ...(addonProductId && { addonProductId }),
            ...(shippingAddress && { shippingAddress }),
            ...(surveyResponses &&
              Object.keys(surveyResponses).length > 0 && { surveyResponses }),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "注文の受付に失敗しました");

        onComplete({
          ok: data.accepted,
          items: data.accepted
            ? completionItems && completionItems.length > 0
              ? completionItems
              : DEFAULT_ACCEPTED_ITEMS
            : FAILED_ITEMS,
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
    const hasFieldError = keysToValidate.some((key) => validateField(key, values[key]));
    const hasShippingError =
      step.kind === "address" &&
      shipToDifferentAddress &&
      SHIPPING_FIELD_KEYS.some((key) => validateShippingField(key, shippingValues[key]));

    if (hasFieldError || hasShippingError) {
      setTouched((prev) => {
        const next = { ...prev };
        for (const key of keysToValidate) next[key] = true;
        return next;
      });
      if (hasShippingError) {
        setShippingTouched((prev) => {
          const next = { ...prev };
          for (const key of SHIPPING_FIELD_KEYS) next[key] = true;
          return next;
        });
      }
      return;
    }

    if (returningToConfirm || stepIndex === steps.length - 1) {
      setReturningToConfirm(false);
      setStage("review");
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleBackStep() {
    if (returningToConfirm) {
      setReturningToConfirm(false);
      setStage("review");
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
            items: completionItems && completionItems.length > 0 ? completionItems : DEFAULT_SUCCESS_ITEMS,
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

        <div className="space-y-2">
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
                  text: stepAnswerText(pastStep, values, { enabled: shipToDifferentAddress, ...shippingValues }),
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
                    onFocus={scrollFieldIntoView}
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

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shipToDifferentAddress}
                onChange={(e) => setShipToDifferentAddress(e.target.checked)}
              />
              お届け先を注文者と別にする
            </label>

            {shipToDifferentAddress && (
              <div className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">お届け先のお名前</span>
                  <input
                    className="input"
                    value={shippingValues.recipientName}
                    onChange={(e) =>
                      setShippingValues((prev) => ({ ...prev, recipientName: e.target.value }))
                    }
                    onFocus={scrollFieldIntoView}
                    onBlur={() => setShippingTouched((prev) => ({ ...prev, recipientName: true }))}
                  />
                  {shippingTouched.recipientName &&
                    validateShippingField("recipientName", shippingValues.recipientName) && (
                      <p className="mt-1 text-xs text-red-600">
                        {validateShippingField("recipientName", shippingValues.recipientName)}
                      </p>
                    )}
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">お届け先の電話番号</span>
                  <input
                    className="input"
                    value={shippingValues.recipientPhone}
                    onChange={(e) =>
                      setShippingValues((prev) => ({ ...prev, recipientPhone: e.target.value }))
                    }
                    onFocus={scrollFieldIntoView}
                    onBlur={() => setShippingTouched((prev) => ({ ...prev, recipientPhone: true }))}
                  />
                  {shippingTouched.recipientPhone &&
                    validateShippingField("recipientPhone", shippingValues.recipientPhone) && (
                      <p className="mt-1 text-xs text-red-600">
                        {validateShippingField("recipientPhone", shippingValues.recipientPhone)}
                      </p>
                    )}
                </label>
                {SHIPPING_ADDRESS_FIELD_KEYS.map((key) => {
                  const errorMsg = validateShippingField(key, shippingValues[key]);
                  const showError = shippingTouched[key] && errorMsg;
                  return (
                    <label key={key} className="block">
                      <span className="mb-1 block text-sm font-medium text-neutral-700">
                        {CHECKOUT_FIELD_LABELS[key]}
                      </span>
                      <input
                        className="input"
                        value={shippingValues[key]}
                        onChange={(e) =>
                          setShippingValues((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onFocus={scrollFieldIntoView}
                        onBlur={() => setShippingTouched((prev) => ({ ...prev, [key]: true }))}
                        placeholder={key === "postalCode" ? "ハイフンなしでも可" : undefined}
                      />
                      {key === "postalCode" && shippingAddressLookupStatus === "loading" && (
                        <p className="mt-1 text-xs text-neutral-400">住所を検索中...</p>
                      )}
                      {key === "postalCode" && shippingAddressLookupStatus === "not_found" && (
                        <p className="mt-1 text-xs text-neutral-400">
                          住所が見つかりませんでした。都道府県以下は下の欄に入力してください。
                        </p>
                      )}
                      {showError && <p className="mt-1 text-xs text-red-600">{errorMsg}</p>}
                    </label>
                  );
                })}
              </div>
            )}
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
                onChange={(e) => {
                  const raw = e.target.value;
                  const corrected = raw && raw < minDeliveryDate() ? minDeliveryDate() : raw;
                  setValues((prev) => ({ ...prev, deliveryDate: corrected }));
                  setTouched((prev) => ({ ...prev, deliveryDate: true }));
                }}
                onFocus={scrollFieldIntoView}
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
                onFocus={scrollFieldIntoView}
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
        ) : step.key === "paymentMethod" ? (
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
                  onChange={() => setValues((prev) => ({ ...prev, paymentMethod: option.value }))}
                />
                <span>
                  <span className="block">
                    {option.label}
                    {methodFees[option.value] > 0 && `(手数料${methodFees[option.value].toLocaleString()}円)`}
                  </span>
                  <span className="block text-xs text-neutral-500">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <label className="block">
            <input
              autoFocus
              type={step.key === "email" ? "email" : "text"}
              className="input"
              value={values[step.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [step.key]: e.target.value }))}
              onFocus={scrollFieldIntoView}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, [step.key]: true }));
                captureLead();
              }}
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

  if (stage === "review") {
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
            <span className="text-neutral-500">ご注文商品</span>
            <span className="font-medium">{activeProduct.name}</span>
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

        {(upsellProduct || crossSellProduct) && (
          <div className="space-y-2">
            {upsellProduct &&
              (activeProduct.id === upsellProduct.id ? (
                <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  {upsellImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={upsellImageUrl}
                      alt=""
                      className="aspect-square w-24 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="font-medium text-amber-800">{upsellProduct.name} に変更中です</p>
                    <p className="mt-1 text-amber-700">{upsellProduct.price.toLocaleString()}円</p>
                    <button
                      type="button"
                      onClick={handleUpsellRevert}
                      className="mt-auto self-end rounded-md border border-amber-400 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
                    >
                      元の商品に戻す
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  {upsellImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={upsellImageUrl}
                      alt=""
                      className="aspect-square w-24 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="font-medium text-amber-800">
                      {truncateOfferComment(upsellComment || `${upsellProduct.name} はいかがですか？`)}
                    </p>
                    <p className="mt-1 text-amber-700">{upsellProduct.price.toLocaleString()}円</p>
                    <button
                      type="button"
                      onClick={handleUpsellSelect}
                      className="mt-auto self-end rounded-md bg-amber-600 px-4 py-1.5 text-xs text-white hover:bg-amber-700"
                    >
                      商品を変更する
                    </button>
                  </div>
                </div>
              ))}
            {crossSellProduct && (
              <div className="flex gap-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm">
                {crossSellImageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={crossSellImageUrl}
                    alt=""
                    className="aspect-square w-24 shrink-0 rounded-md object-cover"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="font-medium text-sky-800">
                    {truncateOfferComment(crossSellComment || `${crossSellProduct.name} も一緒にいかがですか？`)}
                  </p>
                  <p className="mt-1 text-sky-700">{crossSellProduct.price.toLocaleString()}円</p>
                  {addonSelected ? (
                    <button
                      type="button"
                      onClick={() => setAddonSelected(false)}
                      className="mt-auto self-end rounded-md border border-sky-400 px-3 py-1.5 text-xs text-sky-800 hover:bg-sky-100"
                    >
                      取り消す
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddonSelected(true)}
                      className="mt-auto self-end rounded-md bg-sky-600 px-4 py-1.5 text-xs text-white hover:bg-sky-700"
                    >
                      カートに追加する
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
                <span>{stepAnswerText(step, values, { enabled: shipToDifferentAddress, ...shippingValues })}</span>
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

        <AmountBreakdown
          amount={activeProduct.price}
          shippingFee={activeProduct.shipping_fee}
          paymentFee={paymentFee}
          paymentFeeLabel={paymentMethod === "cod" ? "代引手数料" : "後払い手数料"}
          addonAmount={addonSelected && crossSellProduct ? crossSellProduct.price : undefined}
          addonLabel={crossSellProduct ? `追加商品(${crossSellProduct.name})` : undefined}
        />

        <button
          type="button"
          onClick={() => setStage("agreement")}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
        >
          次へ
        </button>
      </div>
    );
  }

  if (stage === "agreement") {
    const canSubmit = agreedTerms && agreedPrivacy;

    return (
      <div className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium">ご注文の確定</p>
          <button
            type="button"
            onClick={() => setStage("review")}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            ← 戻る
          </button>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

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
          amount={activeProduct.price}
          shippingFee={activeProduct.shipping_fee}
          paymentFee={paymentFee}
          paymentFeeLabel={paymentMethod === "cod" ? "代引手数料" : "後払い手数料"}
          addonAmount={addonSelected && crossSellProduct ? crossSellProduct.price : undefined}
          addonLabel={crossSellProduct ? `追加商品(${crossSellProduct.name})` : undefined}
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
      <div className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium">{activeProduct.name} のご注文</p>
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
            {activeProduct.subscription_intervals.map((interval) => (
              <option key={interval} value={interval}>
                {INTERVAL_LABELS[interval]}
              </option>
            ))}
          </select>
        )}

        <AmountBreakdown
          amount={activeProduct.price}
          shippingFee={activeProduct.shipping_fee}
          paymentFee={paymentFee}
          paymentFeeLabel={paymentMethod === "cod" ? "代引手数料" : "後払い手数料"}
          addonAmount={addonSelected && crossSellProduct ? crossSellProduct.price : undefined}
          addonLabel={crossSellProduct ? `追加商品(${crossSellProduct.name})` : undefined}
        />

        <button
          type="button"
          onClick={() => {
            if (returningToConfirm) {
              setReturningToConfirm(false);
              setStage("review");
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
