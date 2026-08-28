import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import {
  resolveLabel,
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
  /** このセグメントで最初に定期契約が始まった日時(セグメント自体の起点、表示用)。 */
  segmentStartIso: string;
  /** 起点からの経過日数(表示用)。 */
  elapsedDays: number;
  /**
   * 経過期間から見て、このセグメントの契約者全員が到達しうる時期に来ている最大回数。
   * 各契約者ごとに「自分自身のお届け頻度・自分自身の初回注文日」から到達しうる回数を求め、
   * その最小値を採用する(1人でもまだその回に届く時期に来ていなければ確定と言えないため)。
   * これにより、頻度(2週間/1ヶ月/2ヶ月ごと)が混在するセグメントでも正しく判定できる。
   */
  ownN: number;
  /** 契約者ごとの到達回数(1以上)。共通比較回数での移行率を再計算するために保持する。 */
  cycleCounts: number[];
  /** 客単価(確定・税込) = 定期注文1回あたりの平均売上。 */
  avgUnitPrice: number;
  /** 定期注文1回あたりの平均増分利益(広告費除く、コストスナップショットの無い注文は0円扱い)。 */
  avgIncrementalProfitPerOrder: number;
}

/**
 * 到達回数nに達した契約者の割合(残存率)を返す。
 * n <= row.ownNの範囲では、ownNの算出方法(各契約者が自分の頻度でnに到達しうる時期に
 * 全員来ていることを保証する最大値)により、対象全員が判定可能な状態であることが
 * 保証されているため、customerCountをそのまま分母に使ってよい。
 */
export function survivalRateAtN(row: SegmentReliabilityRow, n: number): number {
  if (row.customerCount === 0) return 0;
  return row.cycleCounts.filter((c) => c >= n).length / row.customerCount;
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
      customers: { cycleCount: number; intervalDays: number; firstOrderMs: number }[];
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
    const firstOrderMs = new Date(p.firstSubOrder.created_at).getTime();
    const intervalLabel = ctx.intervalByOrderId.get(p.firstSubOrder.id);
    const intervalDays = intervalLabel
      ? (SUBSCRIPTION_INTERVAL_DAYS[intervalLabel as keyof typeof SUBSCRIPTION_INTERVAL_DAYS] ?? DEFAULT_INTERVAL_DAYS)
      : DEFAULT_INTERVAL_DAYS;

    const entry = table.get(label) ?? {
      customers: [],
      orderRevenueTotal: 0,
      orderIncrementalProfitTotal: 0,
      orderCountTotal: 0,
    };
    entry.customers.push({ cycleCount: p.subscriptionCycleCount, intervalDays, firstOrderMs });
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
      const earliestStartMs = Math.min(...entry.customers.map((c) => c.firstOrderMs));
      const elapsedDays = Math.max(0, (asOfMs - earliestStartMs) / MS_PER_DAY);
      // 契約者ごとに「自分の頻度で今何回目まで到達しうるか」を求め、その最小値を採用する。
      const ownN = Math.max(
        1,
        Math.min(
          ...entry.customers.map((c) => {
            const customerElapsedDays = Math.max(0, (asOfMs - c.firstOrderMs) / MS_PER_DAY);
            return Math.floor(customerElapsedDays / c.intervalDays) + 1;
          }),
        ),
      );
      return {
        segment,
        customerCount: entry.customers.length,
        segmentStartIso: new Date(earliestStartMs).toISOString(),
        elapsedDays,
        ownN,
        cycleCounts: entry.customers.map((c) => c.cycleCount),
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
  axis: SegmentAxis | SegmentAxis[],
  ctx: SegmentContext,
  asOfIso: string,
): SegmentReliabilityRow[] {
  return buildReliabilityByLabel(profiles, customersById, ctx, asOfIso, (order, customer) =>
    resolveLabel(axis, order, customer, ctx),
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

/** 要因分解の対象になる、セグメント1件分の予測LTV算出用の入力値。 */
export interface LtvFactorInput {
  avgUnitPrice: number;
  avgIncrementalProfitPerOrder: number;
  survivalSum: number;
}

export interface LtvFactorDecomposition {
  /** 客単価の差による寄与(円)。 */
  priceFactor: number;
  /** 残存率(予測カーブの合計)の差による寄与(円)。 */
  survivalFactor: number;
  /** 差分合計(円) = 対象セグメントのLTV - 基準セグメントのLTV。 */
  total: number;
}

export interface IncrementalProfitFactorDecomposition extends LtvFactorDecomposition {
  /** 原価・同梱物費用・送料原価・販売手数料・支払手数料(1回あたり合算)の差による寄与(円)。 */
  costFactor: number;
}

/**
 * 売上LTVの差分を「客単価要因」「残存率要因」に厳密に分解する(客単価→残存率の順で
 * 寄与を割り当てる逐次分解のため、内訳の合計は必ず実際の差分と一致する)。
 */
export function decomposeRevenueLtv(baseline: LtvFactorInput, target: LtvFactorInput): LtvFactorDecomposition {
  const priceFactor = (target.avgUnitPrice - baseline.avgUnitPrice) * baseline.survivalSum;
  const survivalFactor = target.avgUnitPrice * (target.survivalSum - baseline.survivalSum);
  return { priceFactor, survivalFactor, total: priceFactor + survivalFactor };
}

/**
 * 増分利益LTVの差分を「客単価要因」「コスト要因」「残存率要因」に厳密に分解する。
 * 1回あたりのコスト(原価・同梱物費用・送料原価・販売手数料・支払手数料の合算)は、
 * avgUnitPrice - avgIncrementalProfitPerOrderで逆算する(増分利益の定義式そのものから
 * 導けるため、追加のコストデータ取得は不要)。客単価→コスト→残存率の順で寄与を割り当てる
 * 逐次分解のため、順序を変えると内訳の配分は変わるが、内訳の合計(total)は必ず実際の
 * 差分と一致する。
 */
export function decomposeIncrementalProfitLtv(
  baseline: LtvFactorInput,
  target: LtvFactorInput,
): IncrementalProfitFactorDecomposition {
  const baselineCost = baseline.avgUnitPrice - baseline.avgIncrementalProfitPerOrder;
  const targetCost = target.avgUnitPrice - target.avgIncrementalProfitPerOrder;
  const priceFactor = (target.avgUnitPrice - baseline.avgUnitPrice) * baseline.survivalSum;
  const costFactor = -(targetCost - baselineCost) * baseline.survivalSum;
  const survivalFactor = (target.avgUnitPrice - targetCost) * (target.survivalSum - baseline.survivalSum);
  return { priceFactor, costFactor, survivalFactor, total: priceFactor + costFactor + survivalFactor };
}
