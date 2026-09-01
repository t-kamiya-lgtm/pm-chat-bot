import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { sendCancellationEmail } from "@/lib/order-status-emails";
import { applyImportStatusChange } from "@/lib/order-import-status";
import type { Address, ShippingAddress } from "@/lib/types";

const updateSchema = z.object({
  importStatus: z.enum([
    "imported",
    "on_hold",
    "not_imported",
    "import_error",
    "excluded",
    "shipped",
    "canceled",
  ]),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 注文一覧では確認できない詳細(注文者の住所・電話番号・生年月日・性別、お届け先、
 * 配達希望日時、お客様コメント)を、注文一覧のポップアップ表示用に返す。
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const db = await getDb();
  let row;
  try {
    [row] = await db
      .select({
        orderNumber: orders.orderNumber,
        deliveryDate: orders.deliveryDate,
        deliveryTimeSlot: orders.deliveryTimeSlot,
        shippingAddress: orders.shippingAddress,
        invoiceNote: orders.invoiceNote,
        customerName: customers.name,
        customerNameKana: customers.nameKana,
        customerPhone: customers.phone,
        customerAddress: customers.address,
        customerGender: customers.gender,
        customerBirthDate: customers.birthDate,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.id, id))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: "order not found" }, { status: 404 });

  return NextResponse.json({
    orderNumber: row.orderNumber,
    deliveryDate: row.deliveryDate,
    deliveryTimeSlot: row.deliveryTimeSlot,
    shippingAddress: row.shippingAddress as ShippingAddress | null,
    invoiceNote: row.invoiceNote,
    customer: {
      name: row.customerName,
      nameKana: row.customerNameKana,
      phone: row.customerPhone,
      address: row.customerAddress as Address | null,
      gender: row.customerGender,
      birthDate: row.customerBirthDate,
    },
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = await getDb();
  const result = await applyImportStatusChange(db, id, parsed.data.importStatus);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  let data;
  try {
    [data] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (parsed.data.importStatus === "canceled") {
    await sendCancellationEmail(id);
  }

  return NextResponse.json({ order: data });
}
