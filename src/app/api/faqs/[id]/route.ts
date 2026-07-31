import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  status: z.enum(["draft", "published", "rejected"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 商品QA候補のレビュー(内容修正・承認/却下)。要件定義書 4.7。 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const isReviewDecision = input.status === "published" || input.status === "rejected";

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_faqs")
    .update({
      ...(input.question !== undefined && { question: input.question }),
      ...(input.answer !== undefined && { answer: input.answer }),
      ...(input.status !== undefined && { status: input.status }),
      ...(isReviewDecision && {
        reviewed_by: roleCheck.user.id,
        reviewed_at: new Date().toISOString(),
      }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ faq: data });
}
