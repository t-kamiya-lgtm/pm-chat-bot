import iconv from "iconv-lite";
import { NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders, products } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { readOrderFilters, buildOrderFilterConditions } from "@/lib/order-filters";
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

  const db = await getDb();
  let orderRows;
  try {
    const condition = buildOrderFilterConditions(filters);
    const baseQuery = db.select().from(orders).where(condition).orderBy(desc(orders.createdAt));
    orderRows =
      !filters.showAll && !filters.orderIds?.length ? await baseQuery.limit(100) : await baseQuery;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const customerIds = [...new Set(orderRows.map((o) => o.customerId))];
  const productIds = [
    ...new Set(orderRows.flatMap((o) => [o.productId, o.addonProductId].filter((id): id is string => Boolean(id)))),
  ];

  let customerRows, productRows;
  try {
    [customerRows, productRows] = await Promise.all([
      db
        .select({
          id: customers.id,
          name: customers.name,
          nameKana: customers.nameKana,
          email: customers.email,
          phone: customers.phone,
          address: customers.address,
          gender: customers.gender,
          birthDate: customers.birthDate,
          smaregiMemberId: customers.smaregiMemberId,
        })
        .from(customers)
        .where(inArray(customers.id, customerIds)),
      db
        .select({
          id: products.id,
          name: products.name,
          price: products.price,
          smaregiProductId: products.smaregiProductId,
          isMailDeliverable: products.isMailDeliverable,
        })
        .from(products)
        .where(inArray(products.id, productIds)),
    ]);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const customerById = new Map<string, CoreSystemCustomerRow>(
    customerRows.map((c) => [
      c.id,
      {
        name: c.name,
        name_kana: c.nameKana,
        email: c.email,
        phone: c.phone,
        address: c.address as CoreSystemCustomerRow["address"],
        gender: c.gender,
        birth_date: c.birthDate,
        smaregi_member_id: c.smaregiMemberId,
      },
    ]),
  );
  const productById = new Map<string, CoreSystemProductRow>(
    productRows.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        price: p.price,
        smaregi_product_id: p.smaregiProductId,
        is_mail_deliverable: p.isMailDeliverable,
      },
    ]),
  );

  const exportRows = orderRows.map((o) => ({
    customer_id: o.customerId,
    product_id: o.productId,
    addon_product_id: o.addonProductId,
    shipping_address: o.shippingAddress,
    quantity: o.quantity,
    created_at: o.createdAt,
    order_number: o.orderNumber,
    payment_method: o.paymentMethod,
    delivery_date: o.deliveryDate,
    delivery_time_slot: o.deliveryTimeSlot,
    invoice_note: o.invoiceNote,
    amount: o.amount,
    addon_amount: o.addonAmount,
    shipping_fee: o.shippingFee,
    payment_fee: o.paymentFee,
    discount_amount: o.discountAmount,
    first_time_discount_amount: o.firstTimeDiscountAmount,
    set_selections: o.setSelections,
  }));

  const rows = buildCoreSystemExportRows({ orders: exportRows, customerById, productById });

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
