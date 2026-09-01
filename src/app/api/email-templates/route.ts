import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailTemplates } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/email-templates";

const updateSchema = z.object({
  orderCompletionSubject: z.string().optional(),
  orderCompletionBody: z.string().optional(),
  renewalSubject: z.string().optional(),
  renewalBody: z.string().optional(),
  abandonedLeadSubject: z.string().optional(),
  abandonedLeadBody: z.string().optional(),
  inquiryAutoReplySubject: z.string().optional(),
  inquiryAutoReplyBody: z.string().optional(),
  cancellationSubject: z.string().optional(),
  cancellationBody: z.string().optional(),
  shipmentCompleteSubject: z.string().optional(),
  shipmentCompleteBody: z.string().optional(),
});

/** 管理画面用: 注文完了メール・離脱者リマインドメールの件名・本文テンプレート(全商品共通)。 */
export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const [data] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, 1)).limit(1);

    return NextResponse.json({
      orderCompletionSubject: data?.orderCompletionSubject || DEFAULT_EMAIL_TEMPLATES.orderCompletionSubject,
      orderCompletionBody: data?.orderCompletionBody || DEFAULT_EMAIL_TEMPLATES.orderCompletionBody,
      renewalSubject: data?.renewalSubject || DEFAULT_EMAIL_TEMPLATES.renewalSubject,
      renewalBody: data?.renewalBody || DEFAULT_EMAIL_TEMPLATES.renewalBody,
      abandonedLeadSubject: data?.abandonedLeadSubject || DEFAULT_EMAIL_TEMPLATES.abandonedLeadSubject,
      abandonedLeadBody: data?.abandonedLeadBody || DEFAULT_EMAIL_TEMPLATES.abandonedLeadBody,
      inquiryAutoReplySubject: data?.inquiryAutoReplySubject || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplySubject,
      inquiryAutoReplyBody: data?.inquiryAutoReplyBody || DEFAULT_EMAIL_TEMPLATES.inquiryAutoReplyBody,
      cancellationSubject: data?.cancellationSubject || DEFAULT_EMAIL_TEMPLATES.cancellationSubject,
      cancellationBody: data?.cancellationBody || DEFAULT_EMAIL_TEMPLATES.cancellationBody,
      shipmentCompleteSubject: data?.shipmentCompleteSubject || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteSubject,
      shipmentCompleteBody: data?.shipmentCompleteBody || DEFAULT_EMAIL_TEMPLATES.shipmentCompleteBody,
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
      ...(input.orderCompletionSubject !== undefined && { orderCompletionSubject: input.orderCompletionSubject }),
      ...(input.orderCompletionBody !== undefined && { orderCompletionBody: input.orderCompletionBody }),
      ...(input.renewalSubject !== undefined && { renewalSubject: input.renewalSubject }),
      ...(input.renewalBody !== undefined && { renewalBody: input.renewalBody }),
      ...(input.abandonedLeadSubject !== undefined && { abandonedLeadSubject: input.abandonedLeadSubject }),
      ...(input.abandonedLeadBody !== undefined && { abandonedLeadBody: input.abandonedLeadBody }),
      ...(input.inquiryAutoReplySubject !== undefined && {
        inquiryAutoReplySubject: input.inquiryAutoReplySubject,
      }),
      ...(input.inquiryAutoReplyBody !== undefined && { inquiryAutoReplyBody: input.inquiryAutoReplyBody }),
      ...(input.cancellationSubject !== undefined && { cancellationSubject: input.cancellationSubject }),
      ...(input.cancellationBody !== undefined && { cancellationBody: input.cancellationBody }),
      ...(input.shipmentCompleteSubject !== undefined && {
        shipmentCompleteSubject: input.shipmentCompleteSubject,
      }),
      ...(input.shipmentCompleteBody !== undefined && { shipmentCompleteBody: input.shipmentCompleteBody }),
      updatedAt: new Date().toISOString(),
    };
    await db.insert(emailTemplates).values(values).onConflictDoUpdate({ target: emailTemplates.id, set: values });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
