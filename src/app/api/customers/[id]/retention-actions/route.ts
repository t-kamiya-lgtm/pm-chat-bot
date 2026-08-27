import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminRole } from "@/lib/require-role";

const createSchema = z.object({
  campaignTypeId: z.string().uuid(),
  performedMonth: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM形式で指定してください"),
  subscriptionId: z.string().uuid().nullable().optional(),
  detail: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 顧客の継続施策ログを記録する(顧客管理画面⑥)。 */
export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: customerId } = await params;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customer_retention_actions")
    .insert({
      customer_id: customerId,
      campaign_type_id: parsed.data.campaignTypeId,
      performed_month: `${parsed.data.performedMonth}-01`,
      subscription_id: parsed.data.subscriptionId ?? null,
      detail: parsed.data.detail || null,
      created_by: roleCheck.user.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ retentionAction: data }, { status: 201 });
}
