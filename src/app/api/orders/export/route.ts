import iconv from "iconv-lite";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { readOrderFilters, applyOrderFilters } from "@/lib/order-filters";
import {
  buildCoreSystemExportRows,
  CORE_SYSTEM_EXPORT_HEADER,
  type CoreSystemCustomerRow,
  type CoreSystemProductRow,
} from "@/lib/core-system-export";

/** カンマ・改行・ダブルクオートを含む値のみ引用符で囲む(仕様の「引用符: 必要な値のみ」に合わせる)。 */
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 注文一覧(全決済方法)のCSVダウンロード。
 * 「通販ゲート取込用CSV出力」と同じ59列フォーマットで出力するが、対象は全決済方法(Stripe以外も含む)。
 * 後払い・代引きは通販ゲートへの取込対象ではないため、対応するデータがない項目は空欄になる。
 */
export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const filters = readOrderFilters((key) => searchParams.get(key));

  const supabase = createSupabaseAdminClient();
  let query = supabase.from("orders").select("*").order("created_at", { ascending: false });
  query = applyOrderFilters(query, filters);
  if (!filters.showAll && !filters.orderIds?.length) query = query.limit(100);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customerIds = [...new Set((orders ?? []).map((o) => o.customer_id as string))];
  const productIds = [
    ...new Set(
      (orders ?? []).flatMap((o) =>
        [o.product_id as string, o.addon_product_id as string | null].filter((id): id is string => Boolean(id)),
      ),
    ),
  ];

  const [{ data: customers, error: customersError }, { data: products, error: productsError }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, name_kana, email, phone, address, gender, birth_date, smaregi_member_id")
      .in("id", customerIds),
    supabase
      .from("products")
      .select("id, name, price, smaregi_product_id, is_mail_deliverable")
      .in("id", productIds),
  ]);
  if (customersError) return NextResponse.json({ error: customersError.message }, { status: 500 });
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });

  const customerById = new Map<string, CoreSystemCustomerRow>(
    (customers ?? []).map((c) => [c.id as string, c as CoreSystemCustomerRow]),
  );
  const productById = new Map<string, CoreSystemProductRow>(
    (products ?? []).map((p) => [p.id as string, p as CoreSystemProductRow]),
  );

  const rows = buildCoreSystemExportRows({ orders: orders ?? [], customerById, productById });

  const csv = [Array.from(CORE_SYSTEM_EXPORT_HEADER), ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const buffer = iconv.encode(csv, "cp932");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="orders_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
