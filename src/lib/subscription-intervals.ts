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

/**
 * 代引き・後払いの次回お届け予定日計算、およびスマレジ受注APIのperiod_day(お届け間隔日数)用。
 * Stripeの周期課金は暦月単位で正確に計算されるが、こちらは概算の日数(30日/60日)で扱う。
 */
export const SUBSCRIPTION_INTERVAL_DAYS: Record<SubscriptionInterval, number> = {
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
  test_3day: 3,
};
