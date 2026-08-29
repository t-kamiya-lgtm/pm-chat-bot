export type CouponType = "scenario_auto" | "manual_code";

export interface CouponUsageOrderRow {
  created_at: string;
  discount_amount: number;
  coupon_type: CouponType;
}

export interface CouponUsageDayRow {
  day: string;
  scenarioAutoAmount: number;
  manualCodeAmount: number;
  totalAmount: number;
  scenarioAutoCount: number;
  manualCodeCount: number;
  totalCount: number;
}

export interface CouponUsageReport {
  days: CouponUsageDayRow[];
  totalAmount: number;
  totalCount: number;
  scenarioAutoTotalAmount: number;
  manualCodeTotalAmount: number;
  scenarioAutoTotalCount: number;
  manualCodeTotalCount: number;
}

/** "YYYY-MM"の月内の日付("YYYY-MM-DD")一覧を、月初から月末まで作る。 */
function daysInMonth(month: string): string[] {
  const [year, monthNum] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNum, 0).getDate();
  return Array.from({ length: dayCount }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function dayKeyJst(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function emptyDayRow(day: string): CouponUsageDayRow {
  return {
    day,
    scenarioAutoAmount: 0,
    manualCodeAmount: 0,
    totalAmount: 0,
    scenarioAutoCount: 0,
    manualCodeCount: 0,
    totalCount: 0,
  };
}

/**
 * クーポンが適用された注文一覧(対象月分)から、日別×クーポン種別(自動適用/手入力コード)の
 * 利用額(値引き額)・利用件数の集計表を組み立てる。月内の全日付を行として用意し、
 * 利用のなかった日も0円の行として表示する。
 */
export function buildCouponUsageReport(orders: CouponUsageOrderRow[], month: string): CouponUsageReport {
  const dayKeys = daysInMonth(month);
  const rowsByDay = new Map<string, CouponUsageDayRow>(dayKeys.map((day) => [day, emptyDayRow(day)]));

  for (const order of orders) {
    const day = dayKeyJst(order.created_at);
    const row = rowsByDay.get(day);
    if (!row) continue;
    if (order.coupon_type === "scenario_auto") {
      row.scenarioAutoAmount += order.discount_amount;
      row.scenarioAutoCount += 1;
    } else {
      row.manualCodeAmount += order.discount_amount;
      row.manualCodeCount += 1;
    }
    row.totalAmount += order.discount_amount;
    row.totalCount += 1;
  }

  const days = dayKeys.map((day) => rowsByDay.get(day)!);
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  return {
    days,
    totalAmount: sum(days.map((d) => d.totalAmount)),
    totalCount: sum(days.map((d) => d.totalCount)),
    scenarioAutoTotalAmount: sum(days.map((d) => d.scenarioAutoAmount)),
    manualCodeTotalAmount: sum(days.map((d) => d.manualCodeAmount)),
    scenarioAutoTotalCount: sum(days.map((d) => d.scenarioAutoCount)),
    manualCodeTotalCount: sum(days.map((d) => d.manualCodeCount)),
  };
}
