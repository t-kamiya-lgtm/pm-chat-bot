import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

/** 管理画面用: 商品QAの一覧(レビュー待ち含む)。?productGroupId=&status= でフィルタ可能。 */
export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const productGroupId = searchParams.get("productGroupId");
  const status = searchParams.get("status");

  const supabase = createSupabaseAdminClient();
  let query = supabase.from("product_faqs").select("*").order("created_at", { ascending: false });
  if (productGroupId) query = query.eq("product_group_id", productGroupId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ faqs: data });
}

const createSchema = z.object({
  productGroupId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
});

/** 管理画面から商品QAを手動登録する。登録者が直接入力するためレビューを経ずに即公開する。 */
export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_faqs")
    .insert({
      product_group_id: input.productGroupId,
      category_id: input.categoryId ?? null,
      question: input.question,
      answer: input.answer,
      status: "published",
      source: "manual",
      reviewed_by: roleCheck.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ faq: data }, { status: 201 });
}
