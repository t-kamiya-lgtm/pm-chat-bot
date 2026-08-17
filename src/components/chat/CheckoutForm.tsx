"use client";

import { useEffect, useRef, useState } from "react";
import type { PaymentMethod, SubscriptionInterval } from "@/lib/types";
import type { WidgetProduct } from "@/components/chat/types";
import { AmountBreakdown } from "@/components/chat/AmountBreakdown";
import { StripePaymentForm } from "@/components/chat/StripePaymentForm";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ProductCarousel } from "@/components/chat/ProductCarousel";
import {
  ADDRESS_FIELD_KEYS,
  ADDRESS_KEY_SET,
  CHECKOUT_FIELD_LABELS,
  DEFAULT_CHECKOUT_FIELD_ORDER,
  DELIVERY_FIELD_KEYS,
  DELIVERY_KEY_SET,
  DELIVERY_TIME_SLOTS,
  MIN_DELIVERY_LEAD_BUSINESS_DAYS,
  type CheckoutFieldKey,
} from "@/lib/checkout-fields";
import { isJapaneseHoliday } from "@/lib/japanese-holidays";

/** 管理画面で登録した臨時休業日(YYYY-MM-DD)。起動時に一度だけ取得し、営業日計算に使う。 */
let closedDatesCache = new Set<string>();

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  biweekly: "2週間ごと",
  monthly: "1ヶ月ごと",
  bimonthly: "2ヶ月ごと",
  test_3day: "3日ごと(テスト用)",
};

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string; description: string }[] = [
  {
    value: "stripe",
    label: "クレジットカード / Apple Pay / Google Pay / PayPay",
    description:
      "画面内でそのままお支払いいただけます。このあとの注文確認画面にて、決済処理をお願いします。",
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

/**
 * モバイルでキーボード表示時に入力欄が隠れないよう、フォーカス時にスクロールする。
 * block: "center"だと、埋め込みポップアップ等の小さいコンテナでは中央寄せのために
 * 上下に大きな空白ができ、実質的に入力欄が見えなくなることがあるため"nearest"にする。
 */
function scrollFieldIntoView(e: React.FocusEvent<HTMLElement>) {
  const target = e.target;
  setTimeout(() => {
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 300);
}

const OFFER_COMMENT_MAX_LENGTH = 40;

/** アップセル/クロスセルの案内文はレイアウト崩れを防ぐため文字数を制限する。 */
function truncateOfferComment(text: string): string {
  return text.length > OFFER_COMMENT_MAX_LENGTH
    ? `${text.slice(0, OFFER_COMMENT_MAX_LENGTH)}…`
    : text;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * UTC変換によるタイムゾーンずれ(早朝の日本時間がUTCでは前日になる)を避けるため、ローカルの日付要素から組み立てる。
 * 土日・祝日・管理画面で登録した臨時休業日を除いた営業日ベースで、
 * 本日からMIN_DELIVERY_LEAD_BUSINESS_DAYS営業日後を返す。
 */
function minDeliveryDate(): string {
  const d = new Date();
  let remaining = MIN_DELIVERY_LEAD_BUSINESS_DAYS;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dayOfWeek = d.getDay();
    const isBusinessDay =
      dayOfWeek !== 0 && dayOfWeek !== 6 && !isJapaneseHoliday(d) && !closedDatesCache.has(formatLocalDate(d));
    if (isBusinessDay) remaining -= 1;
  }
  return formatLocalDate(d);
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
    case "phone": {
      if (!trimmed) return "電話番号を入力してください";
      // 数字の区切り以外の位置にハイフンがある(先頭・末尾・連続)場合や、数字・ハイフン以外の
      // 文字が紛れ込んだ場合(誤入力・IME変換の残り等)もエラーとする
      const hasValidShape = /^[0-9]+(-[0-9]+)*$/.test(trimmed);
      const hasValidDigitCount = /^0\d{9,10}$/.test(trimmed.replace(/-/g, ""));
      return hasValidShape && hasValidDigitCount
        ? null
        : "正しい電話番号を入力してください(ハイフンなし10〜11桁)";
    }
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
    case "deliveryDate": {
      if (!trimmed) return "お届け希望日を選択してください";
      if (trimmed < minDeliveryDate()) {
        return `お届け希望日は本日から${MIN_DELIVERY_LEAD_BUSINESS_DAYS}営業日後以降を指定してください`;
      }
      const [y, m, d] = trimmed.split("-").map(Number);
      const picked = new Date(y, m - 1, d);
      const dayOfWeek = picked.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6 || isJapaneseHoliday(picked) || closedDatesCache.has(trimmed)) {
        return "土日・祝日・休業日は指定できません。別の日をお選びください";
      }
      return null;
    }
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
  if (step.kind === "address") return "ご注文者様のご住所を教えてください。";
  if (step.kind === "delivery") return "お届け希望日・時間帯を教えてください。";
  if (step.key === "paymentMethod") return "お支払い方法をお選びください。";
  return `${CHECKOUT_FIELD_LABELS[step.key]}を教えてください。`;
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
  deliveryDateIsAsap?: boolean,
  postDeliveryRestricted?: boolean,
): string {
  if (step.kind === "address") {
    const base = [
      `お名前: ${values.name || "(未入力)"}`,
      `電話番号: ${values.phone || "(未入力)"}`,
      `住所: 〒${values.postalCode} ${values.prefecture}${values.city}${values.line1}`,
    ].join("\n");
    if (shipping?.enabled) {
      const shippingBlock = [
        "お届け先",
        `お名前: ${shipping.recipientName || "(未入力)"}`,
        `電話番号: ${shipping.recipientPhone || "(未入力)"}`,
        `住所: 〒${shipping.postalCode} ${shipping.prefecture}${shipping.city}${shipping.line1}`,
      ].join("\n");
      return `${base}\n\n${shippingBlock}`;
    }
    return base;
  }
  if (step.kind === "delivery") {
    if (postDeliveryRestricted) return "指定不可(ポスト投函)";
    const dateText = deliveryDateIsAsap ? "最短希望" : values.deliveryDate || "(未指定)";
    return `${dateText} ${values.deliveryTimeSlot || ""}`.trim();
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
  alternativeProducts?: WidgetProduct[];
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
  scenarioId?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  couponCodeFieldEnabled?: boolean;
  surveyResponses?: Record<string, string>;
  onComplete: (result: {
    ok: boolean;
    items: GreetingItem[];
    order?: { orderId: string; amount: number };
  }) => void;
  onBack: () => void;
}

type Stage = "options" | "product-select" | "wizard" | "review" | "agreement";

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
  alternativeProducts,
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
  scenarioId,
  utmSource,
  utmMedium,
  utmCampaign,
  couponCodeFieldEnabled,
  surveyResponses,
  onComplete,
  onBack,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeProduct, setActiveProduct] = useState<WidgetProduct>(product);
  const [addonSelected, setAddonSelected] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [setOptionQuantities, setSetOptionQuantities] = useState<Record<string, number>>({});
  const totalSetSelected = Object.values(setOptionQuantities).reduce((sum, q) => sum + q, 0);
  const orderType = activeProduct.order_type;
  // ポスト投函対象商品は、単品1点のみの注文の場合に限りお届け日・時間帯の指定を受け付けない
  // (2点以上、または他商品と同時注文の場合は宅配便出荷となるため指定可能)
  const postDeliveryRestricted =
    activeProduct.is_mail_deliverable && quantity === 1 && !(addonSelected && crossSellProduct);
  const [stage, setStage] = useState<Stage>("options");
  const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>(
    activeProduct.subscription_intervals[0] ?? "monthly",
  );
  const [methodFees, setMethodFees] = useState<Record<PaymentMethod, number>>({
    stripe: 0,
    deferred_invoice: 0,
    cod: 0,
  });

  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponInvalid, setCouponInvalid] = useState(false);
  const [couponChecking, setCouponChecking] = useState(false);
  const addonAmountForCoupon = addonSelected && crossSellProduct ? crossSellProduct.price : 0;
  const couponSubtotal = activeProduct.price * quantity + addonAmountForCoupon;

  async function checkCoupon(code: string) {
    setCouponChecking(true);
    try {
      const res = await fetch("/api/widget/coupon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(scenarioId && { scenarioId }),
          code: code.trim() || undefined,
          subtotal: couponSubtotal,
        }),
      });
      const data = await res.json().catch(() => ({ discountAmount: 0, invalidCode: false }));
      setCouponDiscount(data.discountAmount ?? 0);
      setCouponInvalid(Boolean(data.invalidCode));
    } catch {
      setCouponDiscount(0);
      setCouponInvalid(false);
    } finally {
      setCouponChecking(false);
    }
  }

  // 数量・アドオン変更や商品切り替えで金額が変わるたびに、割引額を再確認する
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) checkCoupon(couponCode);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponSubtotal, activeProduct.id, scenarioId]);

  const [fieldOrder, setFieldOrder] = useState<CheckoutFieldKey[]>(DEFAULT_CHECKOUT_FIELD_ORDER);
  const steps = buildWizardSteps(fieldOrder);
  const [stepIndex, setStepIndex] = useState(0);
  const [returningToConfirm, setReturningToConfirm] = useState(false);
  const [returnToStepIndex, setReturnToStepIndex] = useState<number | null>(null);
  const [values, setValues] = useState<Record<CheckoutFieldKey, string>>({
    paymentMethod: "stripe",
    name: "",
    email: "",
    phone: "",
    postalCode: "",
    prefecture: "",
    city: "",
    line1: "",
    deliveryDate: minDeliveryDate(),
    deliveryTimeSlot: "指定なし",
  });
  const [deliveryDateIsAsap, setDeliveryDateIsAsap] = useState(true);
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

  // ステージ・ステップが切り替わった際のスクロール位置を揃える
  // (基本は下部合わせだが、注文確認画面と、複数項目が並ぶ住所入力は上部合わせにする)。
  // 単一テキスト入力(名前・メール・電話番号)はautoFocus+scrollFieldIntoViewが
  // 別途スクロールするため、二重にスクロールしてカーソル位置がずれるのを避けて何もしない。
  useEffect(() => {
    const currentStep = stage === "wizard" ? steps[stepIndex] : undefined;
    const isAutoFocusedTextField =
      currentStep?.kind === "field" && currentStep.key !== "paymentMethod";
    if (isAutoFocusedTextField) return;
    const isAddressStep = currentStep?.kind === "address";
    const alignTop = stage === "review" || isAddressStep;
    containerRef.current?.scrollIntoView({ block: alignTop ? "start" : "end", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, stepIndex]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [paymentPrepFailed, setPaymentPrepFailed] = useState(false);
  // Stripeの決済確定(onSuccess)はprepareStripePayment完了後に別途発火するため、
  // コンバージョン計測用の注文情報を保持しておく
  const [pendingOrder, setPendingOrder] = useState<{ orderId: string; amount: number } | null>(null);

  // 「同意します」チェック後は決済方法の入力欄が下に表示されるため下部合わせにするが、
  // Stripeの決済フォーム(PaymentElement)は非同期で読み込まれ高さが変わるため、
  // clientSecret確定後にも少し遅らせて再度揃える
  useEffect(() => {
    if (stage !== "agreement" || !agreedPrivacy) return;
    containerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    const timer = setTimeout(() => {
      containerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }, 400);
    return () => clearTimeout(timer);
  }, [stage, agreedPrivacy, clientSecret]);

  useEffect(() => {
    fetch("/api/widget/checkout-fields")
      .then((res) => res.json())
      .then((body: { order?: CheckoutFieldKey[] }) => {
        if (body.order) setFieldOrder(body.order);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/widget/business-closed-dates")
      .then((res) => res.json())
      .then((body: { closedDates?: string[] }) => {
        closedDatesCache = new Set(body.closedDates ?? []);
        // 休業日取得前に仮計算していた最短お届け日がずれている場合、未入力のままなら補正する
        setValues((prev) =>
          !touched.deliveryDate && deliveryDateIsAsap ? { ...prev, deliveryDate: minDeliveryDate() } : prev,
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ポスト投函になる注文は配送員が来ないため、代金引換を選択できないようにする
  useEffect(() => {
    if (!postDeliveryRestricted) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setValues((prev) => (prev.paymentMethod === "cod" ? { ...prev, paymentMethod: "stripe" } : prev));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [postDeliveryRestricted]);

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
      .then((body: { results?: { address1: string; address2: string; address3: string }[] }) => {
        if (cancelled) return;
        const result = body.results?.[0];
        if (result) {
          setValues((prev) => ({
            ...prev,
            prefecture: result.address1,
            city: `${result.address2}${result.address3}`,
          }));
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
      .then((body: { results?: { address1: string; address2: string; address3: string }[] }) => {
        if (cancelled) return;
        const result = body.results?.[0];
        if (result) {
          setShippingValues((prev) => ({
            ...prev,
            prefecture: result.address1,
            city: `${result.address2}${result.address3}`,
          }));
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
    setQuantity(1);
    setSetOptionQuantities({});
  }

  /** 商品編集画面から、同じカルーセルの他の商品に切り替える(住所等の入力済み情報は保持したまま)。 */
  function handleSwitchProduct(nextProduct: WidgetProduct) {
    setActiveProduct(nextProduct);
    setSubscriptionInterval(nextProduct.subscription_intervals[0] ?? "monthly");
    setQuantity(1);
    setSetOptionQuantities({});
    setStage("options");
  }

  /** セットの内訳は、同じ商品を複数個選ぶこともできる(合計は構成数まで)。 */
  function incrementSetOption(optionId: string) {
    if (activeProduct.set_item_count && totalSetSelected >= activeProduct.set_item_count) return;
    setSetOptionQuantities((prev) => ({ ...prev, [optionId]: (prev[optionId] ?? 0) + 1 }));
  }

  function decrementSetOption(optionId: string) {
    setSetOptionQuantities((prev) => {
      const current = prev[optionId] ?? 0;
      if (current <= 1) {
        const rest = { ...prev };
        delete rest[optionId];
        return rest;
      }
      return { ...prev, [optionId]: current - 1 };
    });
  }

  /** 注文者情報・お届け情報など、決済方法によらず共通で送る内容をまとめる。 */
  function buildOrderPayload() {
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
      deliveryDate: postDeliveryRestricted ? "" : values.deliveryDate,
      deliveryTimeSlot: postDeliveryRestricted ? "" : values.deliveryTimeSlot,
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
    const surveyResponsesPayload =
      surveyResponses && Object.keys(surveyResponses).length > 0 ? surveyResponses : undefined;
    const setSelectionsPayload =
      activeProduct.is_set && totalSetSelected > 0
        ? Object.entries(setOptionQuantities).flatMap(([id, qty]) => {
            const option = activeProduct.set_options.find((o) => o.id === id);
            if (!option) return [];
            return Array.from({ length: qty }, () => ({ id: option.id, name: option.name }));
          })
        : undefined;

    return { customer, delivery, addonProductId, shippingAddress, surveyResponsesPayload, setSelectionsPayload };
  }

  /** 規約同意が完了した時点で自動的に呼び出し、カード入力欄の表示に必要なPaymentIntent/Subscriptionを準備する。 */
  async function prepareStripePayment() {
    setError(null);
    setPaymentPrepFailed(false);
    setPreparingPayment(true);

    const { customer, delivery, addonProductId, shippingAddress, surveyResponsesPayload, setSelectionsPayload } =
      buildOrderPayload();

    try {
      const endpoint =
        orderType === "subscription" ? "/api/checkout/subscription" : "/api/checkout/payment-intent";
      const body =
        orderType === "subscription"
          ? {
              productId: activeProduct.id,
              quantity,
              subscriptionInterval,
              customer,
              ...delivery,
              ...(addonProductId && { addonProductId }),
              ...(shippingAddress && { shippingAddress }),
              ...(surveyResponsesPayload && { surveyResponses: surveyResponsesPayload }),
              ...(scenarioId && { scenarioId }),
              ...(utmSource && { utmSource }),
              ...(utmMedium && { utmMedium }),
              ...(utmCampaign && { utmCampaign }),
              ...(couponCode.trim() && { couponCode: couponCode.trim() }),
              ...(setSelectionsPayload && { setSelections: setSelectionsPayload }),
              sessionId,
            }
          : {
              productId: activeProduct.id,
              quantity,
              customer,
              ...delivery,
              ...(addonProductId && { addonProductId }),
              ...(shippingAddress && { shippingAddress }),
              ...(surveyResponsesPayload && { surveyResponses: surveyResponsesPayload }),
              ...(scenarioId && { scenarioId }),
              ...(utmSource && { utmSource }),
              ...(utmMedium && { utmMedium }),
              ...(utmCampaign && { utmCampaign }),
              ...(couponCode.trim() && { couponCode: couponCode.trim() }),
              ...(setSelectionsPayload && { setSelections: setSelectionsPayload }),
              sessionId,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "決済の準備に失敗しました");
      if (!data.clientSecret) throw new Error("決済の準備に失敗しました(client secret missing)");

      if (data.orderId && data.breakdown) {
        setPendingOrder({ orderId: data.orderId, amount: data.breakdown.total });
      }
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError((err as Error).message);
      setPaymentPrepFailed(true);
    } finally {
      setPreparingPayment(false);
    }
  }

  useEffect(() => {
    if (
      !(
        stage === "agreement" &&
        paymentMethod === "stripe" &&
        agreedTerms &&
        agreedPrivacy &&
        !clientSecret &&
        !preparingPayment &&
        !paymentPrepFailed
      )
    ) {
      return;
    }

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) prepareStripePayment();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, paymentMethod, agreedTerms, agreedPrivacy, clientSecret, preparingPayment, paymentPrepFailed]);

  async function submitOrder() {
    if (!agreedTerms || !agreedPrivacy) {
      setError("特定商取引法に基づく表記・個人情報の取り扱いについてに同意のうえお進みください");
      return;
    }

    setError(null);
    setSubmitting(true);

    const { customer, delivery, addonProductId, shippingAddress, surveyResponsesPayload, setSelectionsPayload } =
      buildOrderPayload();

    try {
      const res = await fetch("/api/checkout/deferred", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: activeProduct.id,
          quantity,
          orderType,
          subscriptionInterval: orderType === "subscription" ? subscriptionInterval : undefined,
          paymentMethod,
          customer,
          ...delivery,
          ...(addonProductId && { addonProductId }),
          ...(shippingAddress && { shippingAddress }),
          ...(surveyResponsesPayload && { surveyResponses: surveyResponsesPayload }),
          ...(scenarioId && { scenarioId }),
          ...(utmSource && { utmSource }),
          ...(utmMedium && { utmMedium }),
          ...(utmCampaign && { utmCampaign }),
          ...(couponCode.trim() && { couponCode: couponCode.trim() }),
          ...(setSelectionsPayload && { setSelections: setSelectionsPayload }),
          sessionId,
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
        order: data.accepted && data.orderId && data.breakdown
          ? { orderId: data.orderId, amount: data.breakdown.total }
          : undefined,
      });
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

    // blurイベントに頼らず、次へ進む操作(Enterキー/ボタン押下どちらでも)確実に見込み客情報を保存する
    if (step.kind === "field" && (step.key === "name" || step.key === "email" || step.key === "phone")) {
      captureLead();
    }

    if (returnToStepIndex !== null) {
      const target = returnToStepIndex;
      setReturnToStepIndex(null);
      setStepIndex(target);
      return;
    }

    if (returningToConfirm || stepIndex === steps.length - 1) {
      setReturningToConfirm(false);
      setStage("review");
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  /** ウィザード内の回答済みの質問にある「修正」リンクから、その場でその質問まで戻る。編集後は元いた質問に戻る。 */
  function goToWizardStep(index: number) {
    setReturnToStepIndex((current) => current ?? stepIndex);
    setStepIndex(index);
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

  if (stage === "wizard") {
    const step = steps[stepIndex];
    const isLastStep = stepIndex === steps.length - 1;

    return (
      <div ref={containerRef} className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
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
          <div className="space-y-1">
            <MessageBubble message={{ id: "q-product", from: "bot", kind: "text", text: "ご注文商品" }} />
            <MessageBubble
              message={{
                id: "a-product",
                from: "user",
                kind: "text",
                text: `${activeProduct.name}${quantity > 1 ? ` × ${quantity}点` : ""}`,
              }}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setReturnToStepIndex((current) => current ?? stepIndex);
                  setStage("options");
                }}
                className="text-xs text-blue-600 hover:underline"
              >
                修正
              </button>
            </div>
          </div>
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
                  text: stepAnswerText(
                    pastStep,
                    values,
                    { enabled: shipToDifferentAddress, ...shippingValues },
                    deliveryDateIsAsap,
                    postDeliveryRestricted,
                  ),
                }}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => goToWizardStep(idx)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  修正
                </button>
              </div>
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
          postDeliveryRestricted ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              この商品はポスト投函になるため、お届け日指定ができません。
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-neutral-700">お届け希望日</span>
                <p className="mb-2 text-xs text-neutral-500">
                  {MIN_DELIVERY_LEAD_BUSINESS_DAYS}営業日以降で指定ができます。
                </p>
                <label className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={deliveryDateIsAsap}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDeliveryDateIsAsap(checked);
                      if (checked) {
                        setValues((prev) => ({ ...prev, deliveryDate: minDeliveryDate() }));
                        setTouched((prev) => ({ ...prev, deliveryDate: true }));
                      }
                    }}
                  />
                  最短希望(お届け日を指定しない)
                </label>
                {deliveryDateIsAsap ? null : (
                  <input
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
                )}
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
          )
        ) : step.key === "paymentMethod" ? (
          <div className="space-y-2">
            {postDeliveryRestricted && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                この商品はポスト投函になるため、代金引換はご利用いただけません。
              </p>
            )}
            {PAYMENT_METHOD_OPTIONS.filter(
              (option) => !(postDeliveryRestricted && option.value === "cod"),
            ).map((option) => (
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
              type={step.key === "email" ? "email" : step.key === "phone" ? "tel" : "text"}
              inputMode={step.key === "phone" ? "tel" : undefined}
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

  /**
   * 注文商品・アップセル/クロスセル・注文者情報・金額内訳のまとめ。
   * 「確認」画面から先へ進んでも情報が消えないよう、確認画面・確定画面の両方から呼び出す。
   */
  function renderOrderSummary() {
    return (
      <>
        <div className="space-y-2 rounded-md border border-neutral-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">ご注文商品</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {activeProduct.name}
                {quantity > 1 && ` × ${quantity}`}
              </span>
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
          {activeProduct.is_set && totalSetSelected > 0 && (
            <div className="flex items-start justify-between">
              <span className="shrink-0 text-neutral-500">セット内訳</span>
              <div className="flex items-start gap-2">
                <span className="text-right">
                  {Object.entries(setOptionQuantities)
                    .map(([id, qty]) => {
                      const option = activeProduct.set_options.find((o) => o.id === id);
                      if (!option) return null;
                      return qty > 1 ? `${option.name} ×${qty}` : option.name;
                    })
                    .filter(Boolean)
                    .join(" / ")}
                </span>
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
                    <div className="mt-auto flex items-center justify-end gap-2">
                      <span className="text-xs text-amber-800">数量</span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        className="h-6 w-6 rounded border border-amber-400 text-xs text-amber-800 hover:bg-amber-100"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-xs text-amber-800">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                        className="h-6 w-6 rounded border border-amber-400 text-xs text-amber-800 hover:bg-amber-100"
                      >
                        +
                      </button>
                    </div>
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

        <div className="space-y-3 rounded-md border border-neutral-200 p-3 text-sm">
          {steps.map((step, idx) => {
            // お名前・電話番号は住所とまとめて「ご注文者様情報」として表示するため、単独では表示しない
            if (step.kind === "field" && (step.key === "name" || step.key === "phone")) return null;

            if (step.kind === "address") {
              return (
                <div key="address" className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 font-medium text-neutral-700">ご注文者様情報</span>
                    <button
                      type="button"
                      onClick={() => goToStep(idx)}
                      className="shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      編集
                    </button>
                  </div>
                  <div className="space-y-1 pl-1 text-neutral-600">
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-neutral-500">お名前</span>
                      <span className="text-right">{values.name || "(未入力)"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-neutral-500">電話番号</span>
                      <span className="text-right">{values.phone || "(未入力)"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="shrink-0 text-neutral-500">住所</span>
                      <span className="text-right">
                        〒{values.postalCode} {values.prefecture}
                        {values.city}
                        {values.line1}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <span className="shrink-0 font-medium text-neutral-700">お届け先</span>
                  </div>
                  {shipToDifferentAddress ? (
                    <div className="space-y-1 pl-1 text-neutral-600">
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-neutral-500">お名前</span>
                        <span className="text-right">{shippingValues.recipientName || "(未入力)"}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-neutral-500">電話番号</span>
                        <span className="text-right">{shippingValues.recipientPhone || "(未入力)"}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-neutral-500">住所</span>
                        <span className="text-right">
                          〒{shippingValues.postalCode} {shippingValues.prefecture}
                          {shippingValues.city}
                          {shippingValues.line1}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="pl-1 text-neutral-600">注文者住所にお届け</p>
                  )}
                </div>
              );
            }

            return (
              <div key={step.kind === "field" ? step.key : step.kind} className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-neutral-500">
                  {step.kind === "delivery" ? "お届け希望日・時間帯" : CHECKOUT_FIELD_LABELS[step.key]}
                </span>
                <div className="flex items-start gap-2 text-right">
                  <span>
                    {stepAnswerText(
                      step,
                      values,
                      { enabled: shipToDifferentAddress, ...shippingValues },
                      deliveryDateIsAsap,
                      postDeliveryRestricted,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToStep(idx)}
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                  >
                    編集
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {couponCodeFieldEnabled && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">クーポンコード(お持ちの方)</span>
            <input
              className="input"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              onBlur={() => checkCoupon(couponCode)}
              placeholder="コードをお持ちの場合はご入力ください"
            />
            {couponChecking && <p className="mt-1 text-xs text-neutral-400">確認中...</p>}
            {!couponChecking && couponInvalid && (
              <p className="mt-1 text-xs text-red-600">クーポンコードが無効です</p>
            )}
            {!couponChecking && !couponInvalid && couponCode.trim() && couponDiscount > 0 && (
              <p className="mt-1 text-xs text-green-700">クーポンを適用しました</p>
            )}
          </label>
        )}

        <AmountBreakdown
          amount={activeProduct.price}
          quantity={quantity}
          shippingFee={activeProduct.shipping_fee}
          paymentFee={paymentFee}
          paymentFeeLabel={paymentMethod === "cod" ? "代引手数料" : "後払い手数料"}
          addonAmount={addonSelected && crossSellProduct ? crossSellProduct.price : undefined}
          addonLabel={crossSellProduct ? `追加商品(${crossSellProduct.name})` : undefined}
          discountAmount={couponDiscount}
          firstTimeUnitPrice={
            orderType === "subscription" && activeProduct.first_time_price !== null
              ? activeProduct.first_time_price
              : undefined
          }
        />
      </>
    );
  }

  if (stage === "review") {
    return (
      <div ref={containerRef} className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
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

        {postDeliveryRestricted && paymentMethod === "cod" && (
          <p className="rounded bg-red-50 p-2 text-xs text-red-700">
            この商品はポスト投函のため、代金引換はご利用いただけません。お支払い方法を変更してください。
          </p>
        )}

        {renderOrderSummary()}

        <button
          type="button"
          onClick={() => setStage("agreement")}
          disabled={postDeliveryRestricted && paymentMethod === "cod"}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          次へ
        </button>
      </div>
    );
  }

  if (stage === "agreement") {
    const paymentMethodInvalid = postDeliveryRestricted && paymentMethod === "cod";
    const canSubmit = agreedTerms && agreedPrivacy && !paymentMethodInvalid;

    return (
      <div ref={containerRef} className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
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

        {paymentMethodInvalid && (
          <p className="rounded bg-red-50 p-2 text-xs text-red-700">
            この商品はポスト投函のため、代金引換はご利用いただけません。お支払い方法を変更してください。
          </p>
        )}

        {renderOrderSummary()}

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

        {paymentMethod === "stripe" ? (
          !canSubmit ? (
            <p className="text-center text-xs text-neutral-400">
              上記に同意いただくと、お支払い情報の入力へ進みます
            </p>
          ) : preparingPayment ? (
            <p className="text-center text-sm text-neutral-500">お支払い情報の入力を準備しています…</p>
          ) : clientSecret ? (
            <StripePaymentForm
              clientSecret={clientSecret}
              order={pendingOrder ?? undefined}
              onSuccess={() =>
                onComplete({
                  ok: true,
                  items:
                    completionItems && completionItems.length > 0 ? completionItems : DEFAULT_SUCCESS_ITEMS,
                  order: pendingOrder ?? undefined,
                })
              }
              onError={(message) => setError(message)}
            />
          ) : (
            <button
              type="button"
              onClick={prepareStripePayment}
              className="w-full rounded-md border border-neutral-300 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              もう一度試す
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={submitOrder}
            disabled={submitting || !canSubmit}
            className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {submitting ? "処理中..." : "この内容で注文を確定する"}
          </button>
        )}
      </div>
    );
  }

  if (stage === "product-select") {
    return (
      <div ref={containerRef} className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium">商品を選択してください</p>
          <button
            type="button"
            onClick={() => setStage("options")}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            ← 戻る
          </button>
        </div>
        <ProductCarousel
          products={alternativeProducts ?? []}
          onSelect={(productId) => {
            const next = (alternativeProducts ?? []).find((p) => p.id === productId);
            if (next) handleSwitchProduct(next);
          }}
        />
      </div>
    );
  }

  const setItemCount = activeProduct.set_item_count;

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="font-medium">{activeProduct.name} のご注文</p>
          <button
            type="button"
            onClick={() => {
              // 確認画面・ウィザードからの「修正」経由でこの画面に来た場合は、
              // 入力済みの情報を残したまま元の画面へ戻る(商品選択画面まで抜けて情報を消さない)
              if (returnToStepIndex !== null) {
                const target = returnToStepIndex;
                setReturnToStepIndex(null);
                setStepIndex(target);
                setStage("wizard");
              } else if (returningToConfirm) {
                setReturningToConfirm(false);
                setStage("review");
              } else {
                onBack();
              }
            }}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            ← 戻る
          </button>
        </div>

        {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

        {alternativeProducts && alternativeProducts.length > 1 && (
          <button
            type="button"
            onClick={() => setStage("product-select")}
            className="text-xs text-blue-600 hover:underline"
          >
            他の商品に変更する
          </button>
        )}

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

        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">数量</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-8 w-8 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50"
            >
              −
            </button>
            <span className="w-8 text-center text-sm">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              className="h-8 w-8 rounded-md border border-neutral-300 text-sm hover:bg-neutral-50"
            >
              +
            </button>
          </div>
        </div>

        {postDeliveryRestricted && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
            この商品はポスト投函になるため、お届け日指定ができません。
          </p>
        )}

        {activeProduct.is_set && setItemCount && (
          <div className="rounded-md border border-neutral-200 p-3">
            <p className="mb-2 text-sm font-medium text-neutral-700">
              セットの内訳を({setItemCount}点)選択してください
            </p>
            <p className="mb-2 text-xs text-neutral-400">同じ商品を複数個選ぶこともできます</p>
            <div className="grid grid-cols-2 gap-2">
              {activeProduct.set_options.map((option) => {
                const qty = setOptionQuantities[option.id] ?? 0;
                return (
                  <div
                    key={option.id}
                    className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs ${
                      qty > 0 ? "border-neutral-900 bg-neutral-50" : "border-neutral-200"
                    }`}
                  >
                    {option.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={option.image_url}
                        alt={option.name}
                        className="aspect-square w-full rounded object-cover"
                      />
                    )}
                    <span>{option.name}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={qty === 0}
                        onClick={() => decrementSetOption(option.id)}
                        className="h-6 w-6 rounded border border-neutral-300 hover:bg-neutral-100 disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-4 text-center">{qty}</span>
                      <button
                        type="button"
                        disabled={totalSetSelected >= setItemCount}
                        onClick={() => incrementSetOption(option.id)}
                        className="h-6 w-6 rounded border border-neutral-300 hover:bg-neutral-100 disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              選択中: {totalSetSelected} / {setItemCount}点
            </p>
          </div>
        )}

        <AmountBreakdown
          amount={activeProduct.price}
          quantity={quantity}
          shippingFee={activeProduct.shipping_fee}
          paymentFee={paymentFee}
          paymentFeeLabel={paymentMethod === "cod" ? "代引手数料" : "後払い手数料"}
          addonAmount={addonSelected && crossSellProduct ? crossSellProduct.price : undefined}
          addonLabel={crossSellProduct ? `追加商品(${crossSellProduct.name})` : undefined}
          discountAmount={couponDiscount}
          firstTimeUnitPrice={
            orderType === "subscription" && activeProduct.first_time_price !== null
              ? activeProduct.first_time_price
              : undefined
          }
        />

        <button
          type="button"
          disabled={
            Boolean(activeProduct.is_set && activeProduct.set_item_count) &&
            totalSetSelected !== activeProduct.set_item_count
          }
          onClick={() => {
            if (returnToStepIndex !== null) {
              const target = returnToStepIndex;
              setReturnToStepIndex(null);
              setStepIndex(target);
              setStage("wizard");
            } else if (returningToConfirm) {
              setReturningToConfirm(false);
              setStage("review");
            } else {
              setStepIndex(0);
              setStage("wizard");
            }
          }}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          次へ
        </button>
      </div>
    </div>
  );
}
