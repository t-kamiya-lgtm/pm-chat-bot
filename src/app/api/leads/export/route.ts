import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 離脱リード一覧のCSVダウンロード。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*, products(name)")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = [
    "更新日時",
    "お名前",
    "電話番号",
    "メールアドレス",
    "選択商品",
    "注文状況",
    "電話対応",
    "メール対応",
    "SMS対応",
    "対応状況",
  ];
  const rows = (leads ?? []).map((lead) => {
    const contactedPhone = Boolean(lead.contacted_phone);
    const contactedEmail = Boolean(lead.contacted_email);
    const contactedSms = Boolean(lead.contacted_sms);
    return [
      new Date(lead.updated_at as string).toLocaleString("ja-JP"),
      (lead.name as string | null) ?? "",
      (lead.phone as string | null) ?? "",
      (lead.email as string | null) ?? "",
      (lead.products as { name: string } | null)?.name ?? "",
      lead.order_status === "ordered" ? "注文完了あり" : "離脱のみ",
      contactedPhone ? "済" : "-",
      contactedEmail ? "済" : "-",
      contactedSms ? "済" : "-",
      contactedPhone || contactedEmail || contactedSms ? "対応済み" : "未対応",
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
