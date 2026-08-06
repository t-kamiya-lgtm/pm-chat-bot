import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const greetingItemSchema = z.object({
  type: z.enum(["image", "text"]),
  imageUrl: z.string().optional(),
  linkUrl: z.string().optional(),
  text: z.string().optional(),
});

const updateSchema = z.object({
  greetingItems: z.array(greetingItemSchema).max(5).optional(),
  completionItems: z.array(greetingItemSchema).max(5).optional(),
  privacyNotice: z.string().optional(),
  termsText: z.string().optional(),
  privacyText: z.string().optional(),
  shoppingGuideText: z.string().optional(),
});

/** 管理画面用: 決済フォームのあいさつ文・注文確認メッセージ・特商法/個人情報の本文(全商品共通)。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("checkout_messages").select("*").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 旧・単一テキスト列からの移行: 5項目が未設定でも旧データがあれば1件目として引き継ぐ
  const greetingItems =
    data?.greeting_items?.length > 0
      ? data.greeting_items
      : data?.greeting
        ? [{ type: "text", text: data.greeting }]
        : [];
  const completionItems =
    data?.completion_items?.length > 0
      ? data.completion_items
      : data?.completion_message
        ? [{ type: "text", text: data.completion_message }]
        : [];

  return NextResponse.json({
    greetingItems,
    completionItems,
    privacyNotice: data?.privacy_notice ?? "",
    termsText: data?.terms_text ?? "",
    privacyText: data?.privacy_text ?? "",
    shoppingGuideText: data?.shopping_guide_text ?? "",
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
  const { error } = await supabase.from("checkout_messages").upsert(
    {
      id: 1,
      ...(input.greetingItems !== undefined && { greeting_items: input.greetingItems }),
      ...(input.completionItems !== undefined && { completion_items: input.completionItems }),
      ...(input.privacyNotice !== undefined && { privacy_notice: input.privacyNotice }),
      ...(input.termsText !== undefined && { terms_text: input.termsText }),
      ...(input.privacyText !== undefined && { privacy_text: input.privacyText }),
      ...(input.shoppingGuideText !== undefined && { shopping_guide_text: input.shoppingGuideText }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
