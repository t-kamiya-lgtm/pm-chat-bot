import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { readOrderFilters, applyOrderFilters } from "@/lib/order-filters";
import type { Address, ShippingAddress } from "@/lib/types";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function addressParts(address: Address | null): [string, string, string, string] {
  if (!address) return ["", "", "", ""];
  return [address.postalCode, address.prefecture, address.city, `${address.line1}${address.line2 ?? ""}`];
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
  shipped: "出荷済",
  canceled: "キャンセル",
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
    .select("*, customers(name, email, phone, address), products!product_id(name, smaregi_product_id)")
    .order("created_at", { ascending: false });
  query = applyOrderFilters(query, filters);
  if (!filters.showAll && !filters.orderIds?.length) query = query.limit(100);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "注文番号",
    "日時",
    "顧客",
    "メールアドレス",
    "商品",
    "スマレジ商品ID",
    "数量",
    "種別",
    "支払い方法",
    "金額",
    "決済状況",
    "お届け希望日",
    "お届け希望時間帯",
    "受注ステータス",
    "出荷日",
    "運送会社名",
    "送り状番号",
    "送り状記載内容",
    "注文者電話番号",
    "注文者郵便番号",
    "注文者都道府県",
    "注文者市区町村",
    "注文者番地",
    "お届け先名",
    "お届け先電話番号",
    "お届け先郵便番号",
    "お届け先都道府県",
    "お届け先市区町村",
    "お届け先番地",
  ];
  const rows = (orders ?? []).map((order) => {
    const customer = order.customers as { name: string; email: string; phone: string | null; address: Address | null } | null;
    const shippingAddress = order.shipping_address as ShippingAddress | null;
    const [orderPostal, orderPref, orderCity, orderLine] = addressParts(customer?.address ?? null);
    const [shipPostal, shipPref, shipCity, shipLine] = addressParts(shippingAddress);

    return [
      (order.order_number as string | null) ?? "",
      new Date(order.created_at as string).toLocaleString("ja-JP"),
      customer?.name ?? "",
      customer?.email ?? "",
      (order.products as { name: string } | null)?.name ?? "",
      (order.products as { smaregi_product_id: string | null } | null)?.smaregi_product_id ?? "",
      String(order.quantity as number),
      order.type === "subscription" ? "定期" : "単発",
      PAYMENT_METHOD_LABELS[order.payment_method as string] ?? (order.payment_method as string),
      String((order.amount as number) + (order.shipping_fee as number) + (order.payment_fee as number)),
      STATUS_LABELS[order.status as string] ?? (order.status as string),
      (order.delivery_date as string | null) ?? "",
      (order.delivery_time_slot as string | null) ?? "",
      IMPORT_STATUS_LABELS[order.import_status as string] ?? (order.import_status as string),
      order.shipped_at ? new Date(order.shipped_at as string).toLocaleDateString("ja-JP") : "",
      (order.carrier_name as string | null) ?? "",
      (order.tracking_number as string | null) ?? "",
      (order.invoice_note as string | null) ?? "",
      customer?.phone ?? "",
      orderPostal,
      orderPref,
      orderCity,
      orderLine,
      shippingAddress?.recipientName ?? customer?.name ?? "",
      shippingAddress?.recipientPhone ?? customer?.phone ?? "",
      shipPostal || orderPostal,
      shipPref || orderPref,
      shipCity || orderCity,
      shipLine || orderLine,
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
