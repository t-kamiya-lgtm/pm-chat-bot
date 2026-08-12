import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/require-role";
import { smaregiSearch } from "@/lib/adapters/smaregi-client";

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
      searchOptions: { limit: 5 },
      searchFields: [
        "order.order_id",
        "order.ec_type",
        "order.order_status",
        "order.order_status_name",
        "order.payment_id",
        "order.payment_method",
        "order.payment_status",
        "order.deliv_id",
        "order.deliv_method",
        "order.reserve_type",
        "order.reserve_type_name",
        "order.order_root",
        "order.order_root_name",
        "order.order_date",
      ],
    });
    return NextResponse.json({ response });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
