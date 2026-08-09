import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 手入力コード(manual_code)クーポンの複製。
 * コードは一意制約があるため引き継がず、末尾に連番を付けて発行し、
 * 管理者が編集画面で正式なコードに変更することを想定する。
 * 使用数・有効状態はリセットする。
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data: source, error: sourceError } = await supabase
    .from("coupons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (source.type !== "manual_code") {
    return NextResponse.json({ error: "シナリオ自動適用クーポンは複製できません" }, { status: 400 });
  }

  let code = `${source.code}_COPY`;
  for (let suffix = 2; ; suffix++) {
    const { data: existing } = await supabase.from("coupons").select("id").eq("code", code).maybeSingle();
    if (!existing) break;
    code = `${source.code}_COPY${suffix}`;
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      type: "manual_code",
      scenario_id: null,
      code,
      name: `${source.name}(コピー)`,
      discount_type: source.discount_type,
      discount_value: source.discount_value,
      starts_at: source.starts_at,
      ends_at: source.ends_at,
      max_uses: source.max_uses,
      min_order_amount: source.min_order_amount,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ coupon: data }, { status: 201 });
}
