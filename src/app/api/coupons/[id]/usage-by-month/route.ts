import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string }> };

/** クーポンの使用実績を月ごとに集計する(注文数が多くない前提で、取得後にJS側で集計)。 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("orders").select("created_at").eq("coupon_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const countsByMonth = new Map<string, number>();
  for (const row of data ?? []) {
    const month = (row.created_at as string).slice(0, 7);
    countsByMonth.set(month, (countsByMonth.get(month) ?? 0) + 1);
  }

  const months = Array.from(countsByMonth.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  return NextResponse.json({ months });
}
