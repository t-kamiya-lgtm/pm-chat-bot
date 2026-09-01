import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string }> };

/** クーポンの使用実績を月ごとに集計する(注文数が多くない前提で、取得後にJS側で集計)。 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  let data;
  try {
    const db = await getDb();
    data = await db.select({ createdAt: orders.createdAt }).from(orders).where(eq(orders.couponId, id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const countsByMonth = new Map<string, number>();
  for (const row of data) {
    const month = row.createdAt.slice(0, 7);
    countsByMonth.set(month, (countsByMonth.get(month) ?? 0) + 1);
  }

  const months = Array.from(countsByMonth.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  return NextResponse.json({ months });
}
