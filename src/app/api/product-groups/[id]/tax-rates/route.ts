import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  taxRateId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 商品ジャンル(アイテム)ごとの税率適用期間の一覧・登録。 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const [assignmentsRes, taxRatesRes] = await Promise.all([
    supabase
      .from("product_group_tax_rates")
      .select("*")
      .eq("product_group_id", id)
      .order("period_start", { ascending: false }),
    supabase.from("tax_rates").select("id, name, rate"),
  ]);
  if (assignmentsRes.error) return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });
  if (taxRatesRes.error) return NextResponse.json({ error: taxRatesRes.error.message }, { status: 500 });

  const taxRateById = new Map((taxRatesRes.data ?? []).map((t) => [t.id as string, t]));
  const assignments = (assignmentsRes.data ?? []).map((a) => ({
    ...a,
    tax_rates: taxRateById.get(a.tax_rate_id as string) ?? null,
  }));

  return NextResponse.json({ assignments });
}

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const periodEnd = parsed.data.periodEnd ?? null;
  if (periodEnd && parsed.data.periodStart > periodEnd) {
    return NextResponse.json({ error: "開始日は終了日より前に指定してください" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_group_tax_rates")
    .insert({
      product_group_id: id,
      tax_rate_id: parsed.data.taxRateId,
      period_start: parsed.data.periodStart,
      period_end: periodEnd,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data }, { status: 201 });
}
