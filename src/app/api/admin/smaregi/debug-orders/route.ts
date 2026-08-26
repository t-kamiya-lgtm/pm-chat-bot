import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/require-role";
import { smaregiSearch } from "@/lib/adapters/smaregi-client";
import { getSmaregiTokenDebugInfo } from "@/lib/smaregi-oauth";

/**
 * 【調査用・一時的なエンドポイント】直近の実際の受注データを数件取得し、
 * order_status/payment_status/reserve_typeなど、マスタ変換が必要な項目の実際の値を確認する。
 * 読み取りのみ(受注APIのsearch)で、データの変更は行わない。admin限定。
 */
export async function GET() {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const response = await smaregiSearch("/api/v2/orders/search", {
      searchOptions: { limit: 20 },
      searchFields: [
        "order.order_id",
        "order.ec_order_id",
        "order.ec_type",
        "order.order_status",
        "order.order_status_name",
        "order.payment_id",
        "order.payment_method",
        "order.payment_status",
        "order.payment_amount_total",
        "order.deliv_id",
        "order.deliv_method",
        "order.hasso_deliv_kbn",
        "order.deliv_kbn_method",
        "order.reserve_type",
        "order.reserve_type_name",
        "order.order_root",
        "order.order_root_name",
        "order.order_date",
        // 割引・クーポン関連の実際の値を確認するための項目(payment_total不一致エラーの調査用)。
        "order.subtotal",
        "order.discount",
        "order.other_discount",
        "order.total",
        "order.tax",
        "order.total_notax",
        "order.total_tax",
        "order.deliv_fee",
        "order.charge",
        "order.payment_total",
        "order.coupon_total",
        "order.use_point",
        "order_detail.detail_kbn",
        "order_detail.product_code",
        "order_detail.product_reg_flag",
      ],
    });
    return NextResponse.json({ response });
  } catch (err) {
    const tokenInfo = await getSmaregiTokenDebugInfo().catch(() => null);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), tokenInfo },
      { status: 500 },
    );
  }
}
