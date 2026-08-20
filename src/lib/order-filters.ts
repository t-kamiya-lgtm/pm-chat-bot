export type ImportStatus =
  | "imported"
  | "on_hold"
  | "not_imported"
  | "import_error"
  | "excluded"
  | "shipped"
  | "canceled";

const IMPORT_STATUSES: ImportStatus[] = [
  "imported",
  "on_hold",
  "not_imported",
  "import_error",
  "excluded",
  "shipped",
  "canceled",
];

export interface OrderFilterParams {
  dateFrom?: string;
  dateTo?: string;
  orderType?: "one_time" | "subscription";
  importStatus?: ImportStatus;
  showAll: boolean;
}

/** 注文一覧・CSV出力で共通して使うフィルタ条件を、クエリパラメータ取得関数から読み取る。 */
export function readOrderFilters(getParam: (key: string) => string | null | undefined): OrderFilterParams {
  const dateFrom = getParam("dateFrom") || undefined;
  const dateTo = getParam("dateTo") || undefined;

  const orderTypeRaw = getParam("orderType");
  const orderType = orderTypeRaw === "one_time" || orderTypeRaw === "subscription" ? orderTypeRaw : undefined;

  const importStatusRaw = getParam("importStatus");
  const importStatus: ImportStatus | undefined = IMPORT_STATUSES.includes(importStatusRaw as ImportStatus)
    ? (importStatusRaw as ImportStatus)
    : undefined;

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
  if (filters.importStatus) q = q.eq("import_status", filters.importStatus);
  return q;
}
