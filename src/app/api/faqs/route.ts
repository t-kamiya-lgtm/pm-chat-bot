import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

/** 管理画面用: 商品QAの一覧(レビュー待ち含む)。?productId=&status= でフィルタ可能。 */
export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const status = searchParams.get("status");

  const supabase = createSupabaseAdminClient();
  let query = supabase.from("product_faqs").select("*").order("created_at", { ascending: false });
  if (productId) query = query.eq("product_id", productId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ faqs: data });
}
