import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import {
  resolveSegmentLabel,
  type CustomerLtvProfile,
  type LtvCustomerRow,
  type LtvOrderRow,
  type SegmentAxis,
  type SegmentContext,
} from "@/lib/subscription-ltv";

const DEFAULT_INTERVAL_DAYS = SUBSCRIPTION_INTERVAL_DAYS.monthly;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * セグメント(施策)ごとの「経過期間から見て、今どこまで公平に比較できるか」を表す。
 * 開始時期が違うセグメント同士を暦日の期間で比較すると、開始が新しいセグメントほど
 * 不利に見える(未成熟なだけ)ため、各セグメント固有の到達回数(ownN)と、
 * 比較対象内で最も浅いセグメントに揃えた共通比較回数(呼び出し側で決める)の
 * 両方を出せるように、判定に必要な生データ(cycleCounts)を保持する。
 */
export interface SegmentReliabilityRow {
  segment: string;
  /** このセグメントの定期契約者数(全件)。 */
  customerCount: number;
  /** このセグメントで最初に定期契約が始まった日時(セグメント自体の起点)。 */
  segmentStartIso: string;
  /** セグメント内で最も多いお届け頻度(日数換算に使う代表値)。 */
  dominantIntervalDays: number;
  /** 起点からの経過日数。 */
  elapsedDays: number;
  /** 経過期間から見て、このセグメントが確定値として比較に使える最大到達回数。 */
  ownN: number;
  /** 契約者ごとの到達回数(1以上)。共通比較回数での移行率を再計算するために保持する。 */
  cycleCounts: number[];
  /** 客単価(確定・税込) = 定期注文1回あたりの平均売上。 */
  avgUnitPrice: number;
  /** 定期注文1回あたりの平均増分利益(広告費除く、コストスナップショットの無い注文は0円扱い)。 */
  avgIncrementalProfitPerOrder: number;
}

/** 到達回数nに達した契約者の割合(残存率)を返す。 */
export function survivalRateAtN(row: SegmentReliabilityRow, n: number): number {
  if (row.customerCount === 0) return 0;
  return row.cycleCounts.filter((c) => c >= n).length / row.customerCount;
}

function modeIntervalDays(intervalDaysList: number[]): number {
  if (intervalDaysList.length === 0) return DEFAULT_INTERVAL_DAYS;
  const counts = new Map<number, number>();
  for (const d of intervalDaysList) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best = intervalDaysList[0];
  let bestCount = 0;
  for (const [days, count] of counts) {
    if (count > bestCount) {
      best = days;
      bestCount = count;
    }
  }
  return best;
}

/**
 * セグメント別に、固有到達回数(ownN)を含む「成熟度」情報を組み立てる共通ロジック。
 * labelOfでラベルの決め方(軸別ラベル、または「全体」固定など)を切り替えられる。
 */
function buildReliabilityByLabel(
  profiles: CustomerLtvProfile[],
  customersById: Map<string, LtvCustomerRow>,
  ctx: SegmentContext,
  asOfIso: string,
  labelOf: (order: LtvOrderRow, customer: LtvCustomerRow) => string,
): SegmentReliabilityRow[] {
  const table = new Map<
    string,
    {
      cycleCounts: number[];
      intervalDaysList: number[];
      startMs: number;
      orderRevenueTotal: number;
      orderIncrementalProfitTotal: number;
      orderCountTotal: number;
    }
  >();

  for (const p of profiles) {
    if (!p.isSubscriber || !p.firstSubOrder) continue;
    const customer = customersById.get(p.customerId);
    if (!customer) continue;
    const label = labelOf(p.firstSubOrder, customer);
    const startMs = new Date(p.firstSubOrder.created_at).getTime();
    const intervalLabel = ctx.intervalByOrderId.get(p.firstSubOrder.id);
    const intervalDays = intervalLabel
      ? (SUBSCRIPTION_INTERVAL_DAYS[intervalLabel as keyof typeof SUBSCRIPTION_INTERVAL_DAYS] ?? DEFAULT_INTERVAL_DAYS)
      : DEFAULT_INTERVAL_DAYS;

    const entry = table.get(label) ?? {
      cycleCounts: [],
      intervalDaysList: [],
      startMs,
      orderRevenueTotal: 0,
      orderIncrementalProfitTotal: 0,
      orderCountTotal: 0,
    };
    entry.cycleCounts.push(p.subscriptionCycleCount);
    entry.intervalDaysList.push(intervalDays);
    entry.startMs = Math.min(entry.startMs, startMs);
    // 客単価・増分利益は「定期注文1回あたり」で見るため、契約者ごとの定期売上・増分利益合計を
    // 定期注文回数で割ったものを積み上げる(サブスク全体の平均単価に相当)。
    entry.orderRevenueTotal += p.subscriptionRevenue;
    entry.orderIncrementalProfitTotal += p.totalIncrementalProfit;
    entry.orderCountTotal += p.subscriptionCycleCount;
    table.set(label, entry);
  }

  const asOfMs = new Date(asOfIso).getTime();

  return Array.from(table.entries())
    .map(([segment, entry]) => {
      const dominantIntervalDays = modeIntervalDays(entry.intervalDaysList);
      const elapsedDays = Math.max(0, (asOfMs - entry.startMs) / MS_PER_DAY);
      const ownN = Math.max(1, Math.floor(elapsedDays / dominantIntervalDays) + 1);
      return {
        segment,
        customerCount: entry.cycleCounts.length,
        segmentStartIso: new Date(entry.startMs).toISOString(),
        dominantIntervalDays,
        elapsedDays,
        ownN,
        cycleCounts: entry.cycleCounts,
        avgUnitPrice: entry.orderCountTotal > 0 ? entry.orderRevenueTotal / entry.orderCountTotal : 0,
        avgIncrementalProfitPerOrder: entry.orderCountTotal > 0 ? entry.orderIncrementalProfitTotal / entry.orderCountTotal : 0,
      };
    })
    .sort((a, b) => b.customerCount - a.customerCount);
}

/**
 * セグメント別に、固有到達回数(ownN)を含む「成熟度」情報を組み立てる。
 * ownNは「セグメントの起点(最古の初回定期注文日)からの経過日数 ÷ 代表的なお届け頻度の日数」
 * で求める、そのセグメントが確定値として語れる最大到達回数。
 */
export function buildSegmentReliability(
  profiles: CustomerLtvProfile[],
  customersById: Map<string, LtvCustomerRow>,
  axis: SegmentAxis,
  ctx: SegmentContext,
  asOfIso: string,
): SegmentReliabilityRow[] {
  return buildReliabilityByLabel(profiles, customersById, ctx, asOfIso, (order, customer) =>
    resolveSegmentLabel(axis, order, customer, ctx),
  );
}

/**
 * 軸で分けず、定期契約者全体を1セグメントとして扱う成熟度情報。
 * セグメント固有の残存率カーブが確定回次不足で不安定な場合の、フォールバック移行率の算出に使う。
 */
export function buildOverallReliability(
  profiles: CustomerLtvProfile[],
  customersById: Map<string, LtvCustomerRow>,
  ctx: SegmentContext,
  asOfIso: string,
): SegmentReliabilityRow | null {
  const rows = buildReliabilityByLabel(profiles, customersById, ctx, asOfIso, () => "全体");
  return rows[0] ?? null;
}

export interface RetentionCurvePoint {
  n: number;
  /** 確定値(%)。まだ到達回数(ownN)を超えている回次はnull。 */
  confirmed: number | null;
  /** 予測値(%)。確定済みの回次は確定値と同じ、それ以降は自動更新モデルによる予測。 */
  forecast: number;
}

function confirmedSurvivalSeries(row: SegmentReliabilityRow): number[] {
  const series: number[] = [];
  for (let n = 1; n <= row.ownN; n++) series.push(survivalRateAtN(row, n) * 100);
  return series;
}

/**
 * セグメント内で確定している全回次間の移行率の幾何平均。
 * 確定済みの回次が1つ以下(移行が1回も観測できていない)の場合はnullを返す。
 */
export function geoMeanTransitionRate(row: SegmentReliabilityRow): number | null {
  const confirmedSurvival = confirmedSurvivalSeries(row);
  const transitionRates: number[] = [];
  for (let i = 1; i < confirmedSurvival.length; i++) {
    if (confirmedSurvival[i - 1] > 0) transitionRates.push(confirmedSurvival[i] / confirmedSurvival[i - 1]);
  }
  if (transitionRates.length === 0) return null;
  return Math.exp(transitionRates.reduce((sum, r) => sum + Math.log(r), 0) / transitionRates.length);
}

/**
 * セグメントの残存率カーブ(確定値+予測値)を組み立てる。
 * 予測は「確定済みの全回次間の移行率の幾何平均」を、最後に確定した回次から先に
 * 適用して延長する(自動更新モデル)。確定済みの回次が1つ以下で移行率が
 * 求められない場合は、fallbackRate(システム全体の平均移行率など)で代用する。
 */
export function buildRetentionCurve(
  row: SegmentReliabilityRow,
  opts: { horizon?: number; fallbackRate?: number } = {},
): RetentionCurvePoint[] {
  const horizon = opts.horizon ?? 12;
  const confirmedSurvival = confirmedSurvivalSeries(row);
  const geoMeanRate = geoMeanTransitionRate(row) ?? opts.fallbackRate ?? 1;

  const points: RetentionCurvePoint[] = [];
  for (let n = 1; n <= horizon; n++) {
    if (n <= confirmedSurvival.length) {
      points.push({ n, confirmed: confirmedSurvival[n - 1], forecast: confirmedSurvival[n - 1] });
    } else {
      const lastConfirmed = confirmedSurvival[confirmedSurvival.length - 1] ?? 100;
      const stepsBeyond = n - confirmedSurvival.length;
      points.push({ n, confirmed: null, forecast: lastConfirmed * Math.pow(geoMeanRate, stepsBeyond) });
    }
  }
  return points;
}

export interface ProjectedLtv {
  revenueLtv: number;
  incrementalProfitLtv: number;
}

/** 残存率カーブと客単価・増分利益単価から、指定horizonまでの予測LTVを算出する。 */
export function projectLtv(row: SegmentReliabilityRow, curve: RetentionCurvePoint[]): ProjectedLtv {
  const survivalSum = curve.reduce((sum, p) => sum + p.forecast / 100, 0);
  return {
    revenueLtv: row.avgUnitPrice * survivalSum,
    incrementalProfitLtv: row.avgIncrementalProfitPerOrder * survivalSum,
  };
}

/** 比較対象セグメント群のうち、最も浅い(ownNが小さい)セグメントに揃えた共通比較回数。 */
export function commonBaselineN(rows: SegmentReliabilityRow[]): number {
  if (rows.length === 0) return 1;
  return Math.min(...rows.map((r) => r.ownN));
}
