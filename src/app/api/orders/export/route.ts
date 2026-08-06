import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { readOrderFilters, applyOrderFilters } from "@/lib/order-filters";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: "即時決済(Stripe)",
  deferred_invoice: "後払い(スコアあと払い)",
  cod: "代金引換",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "処理中",
  accepted: "受付済み",
  paid: "支払い完了",
  failed: "失敗",
  canceled: "キャンセル",
};

const IMPORT_STATUS_LABELS: Record<string, string> = {
  imported: "取込み済み",
  on_hold: "保留",
  not_imported: "未取込み",
  import_error: "取込みエラー",
  excluded: "対象外",
};

/** 注文一覧(絞り込み結果)のCSVダウンロード。 */
export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const filters = readOrderFilters((key) => searchParams.get(key));

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("orders")
    .select("*, customers(name, email), products(name)")
    .order("created_at", { ascending: false });
  query = applyOrderFilters(query, filters);
  if (!filters.showAll) query = query.limit(100);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "注文番号",
    "日時",
    "顧客",
    "メールアドレス",
    "商品",
    "数量",
    "種別",
    "支払い方法",
    "金額",
    "状態",
    "お届け希望日",
    "お届け希望時間帯",
    "取り込み",
  ];
  const rows = (orders ?? []).map((order) => [
    (order.order_number as string | null) ?? "",
    new Date(order.created_at as string).toLocaleString("ja-JP"),
    (order.customers as { name: string } | null)?.name ?? "",
    (order.customers as { email: string } | null)?.email ?? "",
    (order.products as { name: string } | null)?.name ?? "",
    String(order.quantity as number),
    order.type === "subscription" ? "定期" : "単発",
    PAYMENT_METHOD_LABELS[order.payment_method as string] ?? (order.payment_method as string),
    String((order.amount as number) + (order.shipping_fee as number) + (order.payment_fee as number)),
    STATUS_LABELS[order.status as string] ?? (order.status as string),
    (order.delivery_date as string | null) ?? "",
    (order.delivery_time_slot as string | null) ?? "",
    IMPORT_STATUS_LABELS[order.import_status as string] ?? (order.import_status as string),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
