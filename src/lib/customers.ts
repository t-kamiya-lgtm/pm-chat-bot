import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("customers")
    .upsert(
      {
        email: input.email,
        name: input.name,
        name_kana: input.nameKana,
        phone: input.phone ?? null,
        gender: input.gender || null,
        birth_date: input.birthDate || null,
        address: input.address,
      },
      { onConflict: "email" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as CustomerRow;
}

export async function setCustomerStripeId(customerId: string, stripeCustomerId: string) {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from("customers")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", customerId);
}
