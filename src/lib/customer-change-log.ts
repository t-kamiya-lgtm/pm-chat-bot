import { desc, eq } from "drizzle-orm";
import { customerChangeLogs } from "@/db/schema";
import type { Db } from "@/lib/db";

export type ChangeLogAction =
  | "customer_info_update"
  | "shipping_address_update"
  | "subscription_content_update"
  | "subscription_item_add"
  | "subscription_item_remove"
  | "subscription_cancel"
  | "subscription_resume"
  | "subscription_skip"
  | "new_order_created";

export interface FieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

/** 顧客管理画面で「個人情報」として扱い、staff権限には伏字で見せるフィールド。 */
const PII_FIELDS = new Set([
  "name",
  "nameKana",
  "email",
  "phone",
  "address",
  "recipientName",
  "recipientPhone",
  "shippingAddress",
]);

export function isPiiField(field: string): boolean {
  return PII_FIELDS.has(field);
}

/** 値が変化したフィールドだけを抽出し、記録用のFieldChange配列を作る。 */
export function diffFields(
  defs: { field: string; label: string; before: unknown; after: unknown }[],
): FieldChange[] {
  return defs
    .filter((d) => JSON.stringify(d.before ?? null) !== JSON.stringify(d.after ?? null))
    .map((d) => ({
      field: d.field,
      label: d.label,
      before: d.before === null || d.before === undefined ? null : String(d.before),
      after: d.after === null || d.after === undefined ? null : String(d.after),
    }));
}

/**
 * 顧客・定期便申込データの変更履歴を1行記録する(1回の保存操作 = 1行)。
 * changesが空(実質的な変更なし)の場合は何も記録しない。
 */
export async function recordChangeLog(
  db: Db,
  params: {
    customerId: string;
    subscriptionId?: string | null;
    action: ChangeLogAction;
    changes: FieldChange[];
    changedByEmail: string;
  },
): Promise<void> {
  if (params.changes.length === 0) return;
  await db.insert(customerChangeLogs).values({
    customerId: params.customerId,
    subscriptionId: params.subscriptionId ?? null,
    action: params.action,
    changes: params.changes,
    changedByEmail: params.changedByEmail,
  });
}

export interface CustomerChangeLogRow {
  id: string;
  subscription_id: string | null;
  action: ChangeLogAction;
  changes: FieldChange[];
  changed_by_email: string;
  created_at: string;
}

/**
 * 変更履歴一覧を取得する。admin以外(staff)には、個人情報を含むフィールドの
 * before/afterを伏字にして返す(何が変わったかという事実(フィールド名)は見せる)。
 */
export async function getCustomerChangeLogs(db: Db, customerId: string, isAdmin: boolean): Promise<CustomerChangeLogRow[]> {
  const data = await db
    .select()
    .from(customerChangeLogs)
    .where(eq(customerChangeLogs.customerId, customerId))
    .orderBy(desc(customerChangeLogs.createdAt));

  const rows: CustomerChangeLogRow[] = data.map((row) => ({
    id: row.id,
    subscription_id: row.subscriptionId,
    action: row.action as ChangeLogAction,
    changes: row.changes as FieldChange[],
    changed_by_email: row.changedByEmail,
    created_at: row.createdAt,
  }));
  if (isAdmin) return rows;

  return rows.map((row) => ({
    ...row,
    changes: row.changes.map((c) =>
      isPiiField(c.field) ? { ...c, before: c.before === null ? null : "***", after: c.after === null ? null : "***" } : c,
    ),
  }));
}
