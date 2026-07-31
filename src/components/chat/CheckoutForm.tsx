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

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "即時決済(カード)",
  deferred_invoice: "後払い(郵便局・コンビニ後払い)",
  cod: "代金引換",
};

interface Props {
  product: WidgetProduct;
  onComplete: (result: { ok: boolean; message: string }) => void;
}

export function CheckoutForm({ product, onComplete }: Props) {
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
      <p className="font-medium">{product.name} のご注文</p>

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

      <select
        className="input"
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
      >
        {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
          <option key={method} value={method}>
            {PAYMENT_METHOD_LABELS[method]}
          </option>
        ))}
      </select>

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
        <input
          required
          placeholder="郵便番号"
          className="input"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
        />
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
