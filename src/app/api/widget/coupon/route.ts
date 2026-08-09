import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveApplicableCoupon } from "@/lib/coupons";

/**
 * チャットウィジェット用の公開エンドポイント(認証不要)。
 * 決済確認画面でのクーポン割引プレビュー用。実際の適用・使用回数の加算は
 * 各決済APIが確定時に改めて行うため、ここでの結果は参考表示にすぎない。
 */
const bodySchema = z.object({
  scenarioId: z.string().uuid().optional(),
  code: z.string().optional(),
  subtotal: z.number().int().min(0),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { scenarioId, code, subtotal } = parsed.data;

  const supabase = createSupabaseAdminClient();
  const applied = await resolveApplicableCoupon(supabase, { scenarioId, code, subtotal });

  if (!applied) {
    return NextResponse.json({
      discountAmount: 0,
      invalidCode: Boolean(code?.trim()),
    });
  }

  return NextResponse.json({ discountAmount: applied.discountAmount, invalidCode: false });
}
