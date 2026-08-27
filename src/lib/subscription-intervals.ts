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
};

/**
 * 代引き・後払いの次回お届け予定日計算、およびスマレジ受注APIのperiod_day(お届け間隔日数)用。
 * Stripeの周期課金は暦月単位で正確に計算されるが、こちらは概算の日数(30日/60日)で扱う。
 */
export const SUBSCRIPTION_INTERVAL_DAYS: Record<SubscriptionInterval, number> = {
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
};

/** 表示用の日本語ラベル(メール本文・管理画面等で使用)。 */
export const SUBSCRIPTION_INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  biweekly: "2週間ごと",
  monthly: "1ヶ月ごと",
  bimonthly: "2ヶ月ごと",
};

const VALID_SUBSCRIPTION_INTERVALS: readonly string[] = Object.keys(SUBSCRIPTION_INTERVAL_DAYS);

/**
 * DBのsubscription_intervalsには、廃止済みの値(例: かつてのテスト用「3日ごと」)が
 * 過去データとして残っている可能性があるため、読み込み時に現在有効な値だけへ絞り込む。
 */
export function sanitizeSubscriptionIntervals(values: unknown): SubscriptionInterval[] {
  if (!Array.isArray(values)) return [];
  return values.filter((v): v is SubscriptionInterval => VALID_SUBSCRIPTION_INTERVALS.includes(v as string));
}
