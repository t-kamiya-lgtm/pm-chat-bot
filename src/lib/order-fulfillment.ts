import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncOrderToSmaregi } from "@/lib/smaregi-order-sync";
import { sendSmaregiSyncFailureAlert } from "@/lib/email";

/**
 * 後払い/代引き受理後に行う、スマレジEC・リピートへの受注連携。
 * Stripe決済の注文はチャットシステム内の受注管理のみで完結させるため、この処理は呼び出さない。
 * 連携結果をorders.import_statusへ反映する(失敗時に「取込み済み」のまま残ると、
 * スマレジ側で出荷対応が漏れるため、成功imported/失敗import_errorを必ず区別する)。
 * 失敗時は管理者へアラートメールを送り、スマレジ_sync_logsの記録だけでは気づけない事態を防ぐ。
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  try {
    await syncOrderToSmaregi(orderId);
    await supabase
      .from("orders")
      .update({ import_status: "imported", import_status_updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("import_status", "not_imported");
  } catch (err) {
    await supabase
      .from("orders")
      .update({ import_status: "import_error", import_status_updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("import_status", "not_imported");

    const { data: orderInfo } = await supabase
      .from("orders")
      .select("order_number")
      .eq("id", orderId)
      .maybeSingle();
    await sendSmaregiSyncFailureAlert({
      orderId,
      orderNumber: orderInfo?.order_number ?? null,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch((alertErr) => {
      console.error("[order-fulfillment] failed to send smaregi sync failure alert", { orderId, alertErr });
    });

    throw err;
  }
}
