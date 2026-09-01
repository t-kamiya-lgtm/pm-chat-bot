import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productFaqs } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["draft", "published", "rejected"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 商品QA候補のレビュー(内容修正・カテゴリ変更・承認/却下)。要件定義書 4.7。 */
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

  try {
    const db = await getDb();
    const [row] = await db
      .update(productFaqs)
      .set({
        ...(input.question !== undefined && { question: input.question }),
        ...(input.answer !== undefined && { answer: input.answer }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.status !== undefined && { status: input.status }),
        ...(isReviewDecision && {
          reviewedBy: roleCheck.user.id,
          reviewedAt: new Date().toISOString(),
        }),
      })
      .where(eq(productFaqs.id, id))
      .returning();
    return NextResponse.json({ faq: row });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
