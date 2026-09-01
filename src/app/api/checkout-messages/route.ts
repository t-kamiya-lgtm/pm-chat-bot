import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { checkoutMessages } from "@/db/schema";
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

type CheckoutMessageItem = { type: "image" | "text"; imageUrl?: string; linkUrl?: string; text?: string };

/** 管理画面用: 決済フォームのあいさつ文・注文確認メッセージ・特商法/個人情報の本文(全商品共通)。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const [data] = await db.select().from(checkoutMessages).where(eq(checkoutMessages.id, 1)).limit(1);

    // 旧・単一テキスト列からの移行: 5項目が未設定でも旧データがあれば1件目として引き継ぐ
    const greetingItemsRaw = data?.greetingItems as CheckoutMessageItem[] | undefined;
    const greetingItems =
      greetingItemsRaw && greetingItemsRaw.length > 0
        ? greetingItemsRaw
        : data?.greeting
          ? [{ type: "text" as const, text: data.greeting }]
          : [];
    const completionItemsRaw = data?.completionItems as CheckoutMessageItem[] | undefined;
    const completionItems =
      completionItemsRaw && completionItemsRaw.length > 0
        ? completionItemsRaw
        : data?.completionMessage
          ? [{ type: "text" as const, text: data.completionMessage }]
          : [];

    return NextResponse.json({
      greetingItems,
      completionItems,
      privacyNotice: data?.privacyNotice ?? "",
      termsText: data?.termsText ?? "",
      privacyText: data?.privacyText ?? "",
      shoppingGuideText: data?.shoppingGuideText ?? "",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
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

  try {
    const db = await getDb();
    const values = {
      id: 1,
      ...(input.greetingItems !== undefined && { greetingItems: input.greetingItems }),
      ...(input.completionItems !== undefined && { completionItems: input.completionItems }),
      ...(input.privacyNotice !== undefined && { privacyNotice: input.privacyNotice }),
      ...(input.termsText !== undefined && { termsText: input.termsText }),
      ...(input.privacyText !== undefined && { privacyText: input.privacyText }),
      ...(input.shoppingGuideText !== undefined && { shoppingGuideText: input.shoppingGuideText }),
      updatedAt: new Date().toISOString(),
    };
    await db
      .insert(checkoutMessages)
      .values(values)
      .onConflictDoUpdate({ target: checkoutMessages.id, set: values });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
