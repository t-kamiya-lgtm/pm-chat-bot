import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** 注文完了時に、その顧客がまだ持っていなければ連番の顧客IDを振る。 */
export async function assignCustomerNumberIfNeeded(customerId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(sql`select assign_customer_number(${customerId})`);
  } catch (err) {
    console.error("[customer-number] failed to assign", { customerId, err });
  }
}
