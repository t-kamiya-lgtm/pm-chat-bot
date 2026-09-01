import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads, products } from "@/db/schema";
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

  let leadRows;
  try {
    const db = await getDb();
    leadRows = await db
      .select({
        updatedAt: leads.updatedAt,
        name: leads.name,
        phone: leads.phone,
        email: leads.email,
        orderStatus: leads.orderStatus,
        contactedPhone: leads.contactedPhone,
        contactedEmail: leads.contactedEmail,
        contactedSms: leads.contactedSms,
        productName: products.name,
      })
      .from(leads)
      .leftJoin(products, eq(leads.productId, products.id))
      .orderBy(desc(leads.updatedAt));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

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
  const rows = leadRows.map((lead) => {
    const contactedPhone = lead.contactedPhone;
    const contactedEmail = lead.contactedEmail;
    const contactedSms = lead.contactedSms;
    return [
      new Date(lead.updatedAt).toLocaleString("ja-JP"),
      lead.name ?? "",
      lead.phone ?? "",
      lead.email ?? "",
      lead.productName ?? "",
      lead.orderStatus === "ordered" ? "注文完了あり" : "離脱のみ",
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
