export interface OrderFilterParams {
  dateFrom?: string;
  dateTo?: string;
  orderType?: "one_time" | "subscription";
  importStatus?: "imported" | "not_imported";
  showAll: boolean;
}

/** 注文一覧・CSV出力で共通して使うフィルタ条件を、クエリパラメータ取得関数から読み取る。 */
export function readOrderFilters(getParam: (key: string) => string | null | undefined): OrderFilterParams {
  const dateFrom = getParam("dateFrom") || undefined;
  const dateTo = getParam("dateTo") || undefined;

  const orderTypeRaw = getParam("orderType");
  const orderType = orderTypeRaw === "one_time" || orderTypeRaw === "subscription" ? orderTypeRaw : undefined;

  const importStatusRaw = getParam("importStatus");
  const importStatus =
    importStatusRaw === "imported" || importStatusRaw === "not_imported" ? importStatusRaw : undefined;

  const showAll = getParam("showAll") === "1";

  return { dateFrom, dateTo, orderType, importStatus, showAll };
}

/** Supabaseのクエリビルダーに、注文一覧の絞り込み条件を適用する。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOrderFilters<T extends { gte: any; lte: any; eq: any }>(
  query: T,
  filters: OrderFilterParams,
): T {
  let q = query;
  if (filters.dateFrom) q = q.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) q = q.lte("created_at", `${filters.dateTo}T23:59:59`);
  if (filters.orderType) q = q.eq("type", filters.orderType);
  if (filters.importStatus === "imported") q = q.eq("imported", true);
  if (filters.importStatus === "not_imported") q = q.eq("imported", false);
  return q;
}
