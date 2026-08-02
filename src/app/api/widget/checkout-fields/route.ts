import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CHECKOUT_FIELD_ORDER, type CheckoutFieldKey } from "@/lib/checkout-fields";

/** チャットウィジェット用: 決済フォーム(1問1答)の質問表示順(認証不要)。 */
export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("checkout_field_order")
    .select("field_key")
    .order("display_order", { ascending: true });

  if (error || !data || data.length === 0) {
    return NextResponse.json({ order: DEFAULT_CHECKOUT_FIELD_ORDER });
  }

  return NextResponse.json({ order: data.map((row) => row.field_key as CheckoutFieldKey) });
}
