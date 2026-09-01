import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productFaqs } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

/** 管理画面用: 商品QAの一覧(レビュー待ち含む)。?productGroupId=&status= でフィルタ可能。 */
export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const productGroupId = searchParams.get("productGroupId");
  const status = searchParams.get("status");

  try {
    const db = await getDb();
    const conditions = [
      productGroupId ? eq(productFaqs.productGroupId, productGroupId) : undefined,
      status ? eq(productFaqs.status, status) : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const rows = await db
      .select()
      .from(productFaqs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(productFaqs.createdAt));
    return NextResponse.json({ faqs: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
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

  try {
    const db = await getDb();
    const [row] = await db
      .insert(productFaqs)
      .values({
        productGroupId: input.productGroupId,
        categoryId: input.categoryId ?? null,
        question: input.question,
        answer: input.answer,
        status: "published",
        source: "manual",
        reviewedBy: roleCheck.user.id,
        reviewedAt: new Date().toISOString(),
      })
      .returning();
    return NextResponse.json({ faq: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
