import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { CHECKOUT_FIELD_KEYS } from "@/lib/checkout-fields";

const updateSchema = z.object({
  order: z.array(z.enum(CHECKOUT_FIELD_KEYS as [string, ...string[]])).length(CHECKOUT_FIELD_KEYS.length),
});

/** 管理画面用: 決済フォーム(1問1答)の質問表示順。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("checkout_field_order")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fields: data });
}

/** 質問順を一括更新する。orderには全フィールドキーを希望の表示順で渡す。 */
export async function PATCH(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const results = await Promise.all(
    parsed.data.order.map((fieldKey, index) =>
      supabase
        .from("checkout_field_order")
        .upsert({ field_key: fieldKey, display_order: index }, { onConflict: "field_key" }),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
