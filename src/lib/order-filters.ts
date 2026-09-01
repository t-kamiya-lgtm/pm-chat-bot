import { and, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { orders } from "@/db/schema";

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
  /** 注文一覧でチェックボックス選択された注文IDのみを対象にする場合に指定する(指定時は他の絞り込み条件を無視する)。 */
  orderIds?: string[];
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

  const orderIdsRaw = getParam("orderIds");
  const orderIds = orderIdsRaw ? orderIdsRaw.split(",").filter(Boolean) : undefined;

  return { dateFrom, dateTo, orderType, importStatus, showAll, orderIds };
}

/**
 * 注文一覧の絞り込み条件を、Drizzleのwhere()にそのまま渡せるSQL条件として組み立てる。
 * orderIdsが指定されている場合は、チェックボックスで選択した注文だけを対象にするため
 * 他の絞り込み条件(日付・種別・受注ステータス)は無視する。
 * 何も条件がない場合はundefinedを返す(呼び出し側は.where(undefined)でよい=絞り込みなし)。
 */
export function buildOrderFilterConditions(filters: OrderFilterParams): SQL | undefined {
  if (filters.orderIds && filters.orderIds.length > 0) {
    return inArray(orders.id, filters.orderIds);
  }

  const conditions: SQL[] = [];
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, `${filters.dateFrom}T00:00:00`));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, `${filters.dateTo}T23:59:59`));
  if (filters.orderType) conditions.push(eq(orders.type, filters.orderType));
  if (filters.importStatus) conditions.push(eq(orders.importStatus, filters.importStatus));
  return conditions.length > 0 ? and(...conditions) : undefined;
}
