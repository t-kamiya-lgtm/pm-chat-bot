import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z
  .object({
    contactedPhone: z.boolean().optional(),
    contactedEmail: z.boolean().optional(),
    contactedSms: z.boolean().optional(),
  })
  .refine((v) => v.contactedPhone !== undefined || v.contactedEmail !== undefined || v.contactedSms !== undefined);

type RouteParams = { params: Promise<{ id: string }> };

/** 離脱リードへのフォローアップ対応(電話・メール・SMS)チェックを更新する。 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .update({
      ...(parsed.data.contactedPhone !== undefined && { contacted_phone: parsed.data.contactedPhone }),
      ...(parsed.data.contactedEmail !== undefined && { contacted_email: parsed.data.contactedEmail }),
      ...(parsed.data.contactedSms !== undefined && { contacted_sms: parsed.data.contactedSms }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lead: data });
}
