import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers } from "@/db/schema";
import { requireAdminRole } from "@/lib/require-role";
import { getStripeClient } from "@/lib/stripe";
import { addressSchema } from "@/lib/checkout-schema";
import { diffFields, recordChangeLog } from "@/lib/customer-change-log";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  nameKana: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  address: addressSchema.nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 注文者情報(顧客管理画面②)をadmin権限で編集する。
 * stripe_customer_idが登録済みの顧客は、Stripe側の顧客情報(請求書・領収メールの宛先)にも同期する。
 * 過去注文の記録には影響しない(以後の新規注文・請求先表示にのみ反映される)。
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  const db = await getDb();
  let customer;
  try {
    [customer] = await db
      .select({
        id: customers.id,
        name: customers.name,
        nameKana: customers.nameKana,
        email: customers.email,
        phone: customers.phone,
        address: customers.address,
        stripeCustomerId: customers.stripeCustomerId,
      })
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!customer) return NextResponse.json({ error: "customer not found" }, { status: 404 });

  const customerUpdate: Record<string, unknown> = {};
  if (input.name !== undefined) customerUpdate.name = input.name;
  if (input.nameKana !== undefined) customerUpdate.nameKana = input.nameKana;
  if (input.email !== undefined) customerUpdate.email = input.email;
  if (input.phone !== undefined) customerUpdate.phone = input.phone;
  if (input.address !== undefined) customerUpdate.address = input.address;

  if (Object.keys(customerUpdate).length === 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    await db.update(customers).set(customerUpdate).where(eq(customers.id, id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (customer.stripeCustomerId && (input.name || input.email || input.phone !== undefined)) {
    try {
      const stripe = getStripeClient();
      await stripe.customers.update(customer.stripeCustomerId, {
        ...(input.name && { name: input.name }),
        ...(input.email && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone ?? undefined }),
      });
    } catch (err) {
      console.error("[customers/edit] failed to sync stripe customer", { customerId: id, err });
    }
  }

  await recordChangeLog(db, {
    customerId: id,
    action: "customer_info_update",
    changes: diffFields([
      { field: "name", label: "氏名", before: customer.name, after: input.name },
      { field: "nameKana", label: "フリガナ", before: customer.nameKana, after: input.nameKana },
      { field: "email", label: "メールアドレス", before: customer.email, after: input.email },
      { field: "phone", label: "電話番号", before: customer.phone, after: input.phone },
      { field: "address", label: "住所", before: customer.address, after: input.address },
    ]),
    changedByEmail: roleCheck.user.email,
  });

  return NextResponse.json({ ok: true });
}
