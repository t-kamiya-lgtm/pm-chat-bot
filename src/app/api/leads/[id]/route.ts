import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z
  .object({
    contactedPhone: z.boolean().optional(),
    contactedEmail: z.boolean().optional(),
    contactedSms: z.boolean().optional(),
  })
  .refine((v) => v.contactedPhone !== undefined || v.contactedEmail !== undefined || v.contactedSms !== undefined);

type RouteParams = { params: Promise<{ id: string }> };

/** 離脱リードへのフォローアップ対応(電話・メール・SMS)チェックを更新する。 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [data] = await db
      .update(leads)
      .set({
        ...(parsed.data.contactedPhone !== undefined && { contactedPhone: parsed.data.contactedPhone }),
        ...(parsed.data.contactedEmail !== undefined && { contactedEmail: parsed.data.contactedEmail }),
        ...(parsed.data.contactedSms !== undefined && { contactedSms: parsed.data.contactedSms }),
      })
      .where(eq(leads.id, id))
      .returning();

    return NextResponse.json({ lead: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
