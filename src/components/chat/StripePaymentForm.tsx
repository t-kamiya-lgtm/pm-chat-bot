"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

export function StripePaymentForm({
  clientSecret,
  order,
  onSuccess,
  onError,
}: {
  clientSecret: string;
  order?: { orderId: string; amount: number };
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentFormInner order={order} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}

function StripePaymentFormInner({
  order,
  onSuccess,
  onError,
}: {
  order?: { orderId: string; amount: number };
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setSubmitting(true);

    // PayPay等、決済確定にリダイレクトが必須な手段では、戻り先URLからしか注文を特定できない
    // (カード等は同一画面に留まりonSuccessがそのまま呼ばれる)ため、注文情報をURLに載せておく。
    const returnUrl = new URL(window.location.href);
    if (order) {
      returnUrl.searchParams.set("pm_order_id", order.orderId);
      returnUrl.searchParams.set("pm_amount", String(order.amount));
    }

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url: returnUrl.toString(),
      },
    });

    setSubmitting(false);

    if (error) {
      onError(error.message ?? "決済に失敗しました");
      return;
    }
    onSuccess();
  }

  return (
    <div className="max-w-[90%] space-y-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <PaymentElement />
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!stripe || submitting}
        className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {submitting ? "処理中..." : "支払う"}
      </button>
    </div>
  );
}
