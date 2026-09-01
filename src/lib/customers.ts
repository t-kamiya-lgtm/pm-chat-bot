import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers } from "@/db/schema";
import type { Address } from "@/lib/types";

export interface CustomerInput {
  email: string;
  name: string;
  nameKana: string;
  phone?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  address: Address;
}

export interface CustomerRow {
  id: string;
  email: string;
  name: string;
  name_kana: string | null;
  phone: string | null;
  address: Address | null;
  gender: string | null;
  birth_date: string | null;
  smaregi_member_id: string | null;
  stripe_customer_id: string | null;
}

/** メールアドレスを一意キーとして顧客を作成/更新する */
export async function upsertCustomer(input: CustomerInput): Promise<CustomerRow> {
  const db = await getDb();

  const values = {
    email: input.email,
    name: input.name,
    nameKana: input.nameKana,
    phone: input.phone ?? null,
    gender: input.gender || null,
    birthDate: input.birthDate || null,
    address: input.address,
  };

  const [row] = await db
    .insert(customers)
    .values(values)
    .onConflictDoUpdate({ target: customers.email, set: values })
    .returning();

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    name_kana: row.nameKana,
    phone: row.phone,
    address: row.address as Address | null,
    gender: row.gender,
    birth_date: row.birthDate,
    smaregi_member_id: row.smaregiMemberId,
    stripe_customer_id: row.stripeCustomerId,
  };
}

export async function setCustomerStripeId(customerId: string, stripeCustomerId: string) {
  const db = await getDb();
  await db.update(customers).set({ stripeCustomerId }).where(eq(customers.id, customerId));
}
