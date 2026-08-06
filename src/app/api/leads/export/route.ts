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

  const { data: completedOrders } = await supabase
    .from("orders")
    .select("customers(email)")
    .in("status", ["paid", "accepted"]);
  const completedEmails = new Set(
    (completedOrders ?? [])
      .map((o) => {
        const customer = Array.isArray(o.customers) ? o.customers[0] : o.customers;
        return (customer as { email: string } | undefined)?.email;
      })
      .filter((email): email is string => Boolean(email)),
  );

  const header = ["更新日時", "お名前", "電話番号", "メールアドレス", "選択商品", "注文状況"];
  const rows = (leads ?? []).map((lead) => [
    new Date(lead.updated_at as string).toLocaleString("ja-JP"),
    (lead.name as string | null) ?? "",
    (lead.phone as string | null) ?? "",
    (lead.email as string | null) ?? "",
    (lead.products as { name: string } | null)?.name ?? "",
    lead.email && completedEmails.has(lead.email as string) ? "注文完了あり" : "離脱のみ",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
