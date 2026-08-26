import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";

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
 * 受注ステータスを変更する。定期購入のルート注文をキャンセルにする場合は、
 * Stripeの定期購入自体も解約し(専用の「定期解約」操作と同じ効果)、
 * subscriptions.statusもcanceledにする(代引き・後払いも含めすべての支払方法で、
 * 以後の定期継続分の生成を止めるため)。
 * 遷移が許可されていない場合はエラーを返す。
 */
export async function applyImportStatusChange(
  supabase: SupabaseAdminClient,
  orderId: string,
  newStatus: ImportStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, import_status, type, payment_method, stripe_subscription_id, parent_order_id")
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

  if (newStatus === "canceled" && order.type === "subscription" && !order.parent_order_id) {
    if (order.payment_method === "stripe" && order.stripe_subscription_id) {
      try {
        const stripe = getStripeClient();
        await stripe.subscriptions.cancel(order.stripe_subscription_id);
      } catch (err) {
        console.error("[order-import-status] failed to cancel stripe subscription", { orderId, err });
      }
    }
    await supabase.from("subscriptions").update({ status: "canceled" }).eq("order_id", orderId);
  }

  return { ok: true };
}
