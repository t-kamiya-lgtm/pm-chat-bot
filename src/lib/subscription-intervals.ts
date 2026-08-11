import type Stripe from "stripe";
import type { SubscriptionInterval } from "@/lib/types";

/** SubscriptionIntervalの各値を、Stripeの周期課金設定(interval/interval_count)に変換する。 */
export const SUBSCRIPTION_INTERVAL_STRIPE_MAP: Record<
  SubscriptionInterval,
  { interval: Stripe.PriceCreateParams.Recurring.Interval; intervalCount: number }
> = {
  biweekly: { interval: "week", intervalCount: 2 },
  monthly: { interval: "month", intervalCount: 1 },
  bimonthly: { interval: "month", intervalCount: 2 },
  test_3day: { interval: "day", intervalCount: 3 },
};
