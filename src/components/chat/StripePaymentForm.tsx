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
  onSuccess,
  onError,
}: {
  clientSecret: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentFormInner onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}

function StripePaymentFormInner({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!stripe || !elements) return;
    setSubmitting(true);

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
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
