import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** 注文完了時に、その顧客がまだ持っていなければ連番の顧客IDを振る。 */
export async function assignCustomerNumberIfNeeded(customerId: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.rpc("assign_customer_number", { p_customer_id: customerId });
  } catch (err) {
    console.error("[customer-number] failed to assign", { customerId, err });
  }
}
