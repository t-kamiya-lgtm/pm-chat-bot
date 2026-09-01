import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { leads } from "@/db/schema";

const leadInputSchema = z.object({
  sessionId: z.string().min(1),
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  productId: z.string().uuid().optional(),
  scenarioId: z.string().uuid().optional(),
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
  const { sessionId, name, phone, email, productId, scenarioId, surveyResponses } = parsed.data;

  try {
    const db = await getDb();
    const values = {
      sessionId,
      ...(name !== undefined && { name: name || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(email !== undefined && { email: email || null }),
      ...(productId !== undefined && { productId }),
      ...(scenarioId !== undefined && { scenarioId }),
      ...(surveyResponses !== undefined && { surveyResponses }),
      updatedAt: new Date().toISOString(),
    };
    await db.insert(leads).values(values).onConflictDoUpdate({ target: leads.sessionId, set: values });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
