import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { checkoutFieldOrder } from "@/db/schema";
import { DEFAULT_CHECKOUT_FIELD_ORDER, mergeCheckoutFieldOrder, type CheckoutFieldKey } from "@/lib/checkout-fields";

/** チャットウィジェット用: 決済フォーム(1問1答)の質問表示順(シナリオ単位、認証不要)。 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("scenarioId");
  if (!scenarioId) return NextResponse.json({ order: DEFAULT_CHECKOUT_FIELD_ORDER });

  try {
    const db = await getDb();
    const rows = await db
      .select({ fieldKey: checkoutFieldOrder.fieldKey })
      .from(checkoutFieldOrder)
      .where(eq(checkoutFieldOrder.scenarioId, scenarioId))
      .orderBy(asc(checkoutFieldOrder.displayOrder));

    if (rows.length === 0) {
      return NextResponse.json({ order: DEFAULT_CHECKOUT_FIELD_ORDER });
    }

    return NextResponse.json({
      order: mergeCheckoutFieldOrder(rows.map((row) => row.fieldKey as CheckoutFieldKey)),
    });
  } catch {
    return NextResponse.json({ order: DEFAULT_CHECKOUT_FIELD_ORDER });
  }
}
