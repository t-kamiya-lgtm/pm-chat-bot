"use client";

import { useEffect, useState } from "react";
import type { OrderType, PaymentMethod, SubscriptionInterval } from "@/lib/types";
import type { WidgetProduct } from "@/components/chat/types";
import { AmountBreakdown } from "@/components/chat/AmountBreakdown";
import { StripePaymentForm } from "@/components/chat/StripePaymentForm";

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

interface Props {
  product: WidgetProduct;
  onComplete: (result: { ok: boolean; message: string }) => void;
  onBack: () => void;
}

export function CheckoutForm({ product, onComplete, onBack }: Props) {
  const [orderType, setOrderType] = useState<OrderType>("one_time");
  const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>(
    product.subscription_intervals[0] ?? "monthly",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [city, setCity] = useState("");
  const [line1, setLine1] = useState("");
  const [addressLookupStatus, setAddressLookupStatus] = useState<"idle" | "loading" | "not_found">(
    "idle",
  );
  const [paymentFee, setPaymentFee] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ paymentMethod, orderType });
    fetch(`/api/widget/fees?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => setPaymentFee(body.fee ?? 0))
      .catch(() => setPaymentFee(0));
  }, [paymentMethod, orderType]);

  useEffect(() => {
    const digitsOnly = postalCode.replace(/[^0-9]/g, "");
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
          setPrefecture(result.address1);
          setCity(result.address2);
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
  }, [postalCode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const customer = {
      name,
      email,
      phone: phone || undefined,
      address: { postalCode, prefecture, city, line1 },
    };

    try {
      if (paymentMethod === "stripe") {
        const endpoint = orderType === "subscription" ? "/api/checkout/subscription" : "/api/checkout/payment-intent";
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

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium">{product.name} のご注文</p>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-neutral-400 hover:text-neutral-600"
        >
          ← 戻る
        </button>
      </div>

      {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      {product.is_subscription_available && (
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={orderType === "one_time"}
              onChange={() => setOrderType("one_time")}
            />
            単発購入
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={orderType === "subscription"}
              onChange={() => setOrderType("subscription")}
            />
            定期購入
          </label>
        </div>
      )}

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
              paymentMethod === option.value
                ? "border-neutral-900 bg-neutral-50"
                : "border-neutral-200"
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

      <div className="grid grid-cols-2 gap-2">
        <input
          required
          placeholder="お名前"
          className="input col-span-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          type="email"
          placeholder="メールアドレス"
          className="input col-span-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="電話番号"
          className="input col-span-2"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="col-span-2">
          <input
            required
            placeholder="郵便番号(ハイフンなしでも可)"
            className="input"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
          {addressLookupStatus === "loading" && (
            <p className="mt-1 text-xs text-neutral-400">住所を検索中...</p>
          )}
          {addressLookupStatus === "not_found" && (
            <p className="mt-1 text-xs text-neutral-400">
              住所が見つかりませんでした。都道府県以下を入力してください。
            </p>
          )}
        </div>
        <input
          required
          placeholder="都道府県"
          className="input"
          value={prefecture}
          onChange={(e) => setPrefecture(e.target.value)}
        />
        <input
          required
          placeholder="市区町村"
          className="input col-span-2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <input
          required
          placeholder="番地・建物名"
          className="input col-span-2"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {submitting ? "処理中..." : "この内容で進める"}
      </button>
    </form>
  );
}
