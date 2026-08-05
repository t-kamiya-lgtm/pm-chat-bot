import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const leadInputSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  productId: z.string().uuid().optional(),
  surveyResponses: z.record(z.string(), z.string()).optional(),
});

/**
 * 入力途中で離脱した見込み客の情報を都度保存する(認証不要)。
 * sessionIdをキーにupsertし、name/phone/email/productIdは埋まった時点のものだけ更新する。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { sessionId, name, phone, email, productId, surveyResponses } = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("leads").upsert(
    {
      session_id: sessionId,
      ...(name !== undefined && { name: name || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(email !== undefined && { email: email || null }),
      ...(productId !== undefined && { product_id: productId }),
      ...(surveyResponses !== undefined && { survey_responses: surveyResponses }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
