import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { scenarioAccessLogs } from "@/db/schema";

/**
 * チャットウィジェット用の公開エンドポイント(認証不要)。
 * ウィジェットが開かれた時点で1セッション1回だけ記録し、実績ダッシュボードの
 * アクセス数・コンバージョン率・広告別内訳の算出に用いる。
 */
const bodySchema = z.object({
  scenarioId: z.string().uuid().optional(),
  sessionId: z.string().min(1),
  utmSource: z.string().nullable().optional(),
  utmMedium: z.string().nullable().optional(),
  utmCampaign: z.string().nullable().optional(),
  referrer: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { scenarioId, sessionId, utmSource, utmMedium, utmCampaign, referrer } = parsed.data;

  try {
    const db = await getDb();
    await db
      .insert(scenarioAccessLogs)
      .values({
        scenarioId: scenarioId ?? null,
        sessionId,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        referrer: referrer ?? null,
      })
      .onConflictDoNothing({ target: scenarioAccessLogs.sessionId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
