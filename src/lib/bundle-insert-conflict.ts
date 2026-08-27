export type BundleInsertTargetOrderType = "subscription" | "one_time" | "both";

export interface BundleInsertSetCandidate {
  id?: string;
  brandId: string;
  periodStart: string;
  periodEnd: string | null;
  targetOrderType: BundleInsertTargetOrderType;
  targetCycleNumbers: number[] | null;
  targetProductIds: string[] | null;
}

export interface BundleInsertSetConflict {
  id: string;
  name: string;
}

function periodsOverlap(a: BundleInsertSetCandidate, b: BundleInsertSetCandidate): boolean {
  const aEnd = a.periodEnd ?? "9999-12-31";
  const bEnd = b.periodEnd ?? "9999-12-31";
  return a.periodStart <= bEnd && b.periodStart <= aEnd;
}

function orderTypesOverlap(a: BundleInsertTargetOrderType, b: BundleInsertTargetOrderType): boolean {
  return a === "both" || b === "both" || a === b;
}

/** targetCycleNumbers/targetProductIdsは null = 全件対象。両方nullでなければ配列の共通要素の有無で判定する。 */
function arraysOverlap<T>(a: T[] | null, b: T[] | null): boolean {
  if (a === null || b === null) return true;
  const bSet = new Set(b);
  return a.some((v) => bSet.has(v));
}

/**
 * 新規/更新しようとしている同梱物設定(candidate)が、既存のアクティブな設定(activeSets、
 * 同一ブランド・自分自身を除く)と条件(期間・対象種別・対象回数・対象商品)がすべて重複するか判定する。
 * すべての軸が重複する場合のみ「同じ条件の注文に適用されうる」設定とみなす。
 */
export function findConflictingSets(
  candidate: BundleInsertSetCandidate,
  activeSets: (BundleInsertSetCandidate & { name: string })[],
): BundleInsertSetConflict[] {
  return activeSets
    .filter((existing) => existing.id !== candidate.id)
    .filter((existing) => existing.brandId === candidate.brandId)
    .filter((existing) => periodsOverlap(candidate, existing))
    .filter((existing) => orderTypesOverlap(candidate.targetOrderType, existing.targetOrderType))
    .filter((existing) => arraysOverlap(candidate.targetCycleNumbers, existing.targetCycleNumbers))
    .filter((existing) => arraysOverlap(candidate.targetProductIds, existing.targetProductIds))
    .map((existing) => ({ id: existing.id!, name: existing.name }));
}
