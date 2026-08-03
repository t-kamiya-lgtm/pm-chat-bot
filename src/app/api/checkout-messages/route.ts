import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  greeting: z.string().optional(),
  completionMessage: z.string().optional(),
  termsText: z.string().optional(),
  privacyText: z.string().optional(),
});

/** 管理画面用: 決済フォームのあいさつ文・注文確認メッセージ・特商法/個人情報の本文(全商品共通)。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("checkout_messages").select("*").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    greeting: data?.greeting ?? "",
    completionMessage: data?.completion_message ?? "",
    termsText: data?.terms_text ?? "",
    privacyText: data?.privacy_text ?? "",
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
  const { error } = await supabase
    .from("checkout_messages")
    .upsert(
      {
        id: 1,
        ...(input.greeting !== undefined && { greeting: input.greeting }),
        ...(input.completionMessage !== undefined && { completion_message: input.completionMessage }),
        ...(input.termsText !== undefined && { terms_text: input.termsText }),
        ...(input.privacyText !== undefined && { privacy_text: input.privacyText }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
