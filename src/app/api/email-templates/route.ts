import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-templates";

const updateSchema = z.object({
  orderCompletionSubject: z.string().optional(),
  orderCompletionBody: z.string().optional(),
  abandonedLeadSubject: z.string().optional(),
  abandonedLeadBody: z.string().optional(),
});

/** 管理画面用: 注文完了メール・離脱者リマインドメールの件名・本文テンプレート(全商品共通)。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("email_templates").select("*").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orderCompletionSubject: data?.order_completion_subject || DEFAULT_EMAIL_TEMPLATES.orderCompletionSubject,
    orderCompletionBody: data?.order_completion_body || DEFAULT_EMAIL_TEMPLATES.orderCompletionBody,
    abandonedLeadSubject: data?.abandoned_lead_subject || DEFAULT_EMAIL_TEMPLATES.abandonedLeadSubject,
    abandonedLeadBody: data?.abandoned_lead_body || DEFAULT_EMAIL_TEMPLATES.abandonedLeadBody,
  });
}

export async function PATCH(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("email_templates").upsert(
    {
      id: 1,
      ...(input.orderCompletionSubject !== undefined && {
        order_completion_subject: input.orderCompletionSubject,
      }),
      ...(input.orderCompletionBody !== undefined && { order_completion_body: input.orderCompletionBody }),
      ...(input.abandonedLeadSubject !== undefined && { abandoned_lead_subject: input.abandonedLeadSubject }),
      ...(input.abandonedLeadBody !== undefined && { abandoned_lead_body: input.abandonedLeadBody }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
