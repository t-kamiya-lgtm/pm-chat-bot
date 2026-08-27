import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type ImportStatus =
  | "not_imported"
  | "on_hold"
  | "imported"
  | "import_error"
  | "shipped"
  | "excluded"
  | "canceled";

/**
 * 受注ステータスの遷移ルール。運用上あり得ない遷移(例: 未取込みから直接出荷済み、
 * 一度キャンセルした注文を復活させる等)を防ぐためのもの。
 * 実際の運用に合わせて調整可能。
 */
const IMPORT_STATUS_TRANSITIONS: Record<ImportStatus, ImportStatus[]> = {
  not_imported: ["imported", "on_hold", "canceled", "excluded", "import_error"],
  on_hold: ["not_imported", "canceled", "excluded"],
  import_error: ["not_imported", "canceled"],
  imported: ["shipped", "on_hold", "canceled", "import_error"],
  shipped: ["canceled"],
  excluded: ["not_imported"],
  canceled: [],
};

export function isValidImportStatusTransition(from: ImportStatus, to: ImportStatus): boolean {
  if (from === to) return true;
  return IMPORT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 受注ステータスを変更する。個別受注のキャンセル(この関数)は、あくまで対象の注文
 * 1件のimport_statusを書き換えるだけで、Stripe定期購入の解約やsubscriptionsテーブルの
 * 更新など他データには一切関与しない(請求取消などは運用担当が個別対応する想定のため)。
 * 定期購入自体の解約は、専用の「定期解約」操作(cancelSubscription、
 * src/app/api/orders/[id]/edit/route.ts)からのみ行う。
 * 遷移が許可されていない場合はエラーを返す。
 */
export async function applyImportStatusChange(
  supabase: SupabaseAdminClient,
  orderId: string,
  newStatus: ImportStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, import_status")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!order) return { ok: false, error: "order not found" };

  const currentStatus = order.import_status as ImportStatus;
  if (!isValidImportStatusTransition(currentStatus, newStatus)) {
    return {
      ok: false,
      error: `受注ステータスを「${currentStatus}」から「${newStatus}」には変更できません`,
    };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ import_status: newStatus, import_status_updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true };
}
