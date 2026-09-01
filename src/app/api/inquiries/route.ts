import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { sendInquiryNotification, sendResendEmail } from "@/lib/email";
import { getDb } from "@/lib/db";
import { scenarios } from "@/db/schema";
import { getEmailTemplates, renderEmailTemplate } from "@/lib/email-templates";
import { resolveScenarioFrom, resolveInquiryReceiveEmail } from "@/lib/scenario-email";

const inquirySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1),
  productName: z.string().optional(),
  chatUrl: z.string().url().optional(),
  scenarioId: z.string().uuid().optional(),
});

/**
 * チャット内埋め込みの問い合わせフォーム(要件定義書 4.7)。
 * DBには永続化せず、担当者へのメール通知と、お客様への一次受け自動返信を行う。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { scenarioId, ...notificationInput } = parsed.data;

  const db = await getDb();
  const [scenarioRow] = scenarioId
    ? await db
        .select({
          emailFromAddress: scenarios.emailFromAddress,
          inquiryReceiveEmail: scenarios.inquiryReceiveEmail,
          inquiryAutoReplyFrom: scenarios.inquiryAutoReplyFrom,
        })
        .from(scenarios)
        .where(eq(scenarios.id, scenarioId))
        .limit(1)
    : [null];
  const scenario = scenarioRow
    ? {
        email_from_address: scenarioRow.emailFromAddress,
        inquiry_receive_email: scenarioRow.inquiryReceiveEmail,
        inquiry_auto_reply_from: scenarioRow.inquiryAutoReplyFrom,
      }
    : null;

  await sendInquiryNotification({
    ...notificationInput,
    receiveEmail: resolveInquiryReceiveEmail(scenario),
  });

  try {
    const templates = await getEmailTemplates();
    const vars = {
      customer_name: parsed.data.name,
      message: parsed.data.message,
      chat_url: parsed.data.chatUrl ?? "",
    };
    await sendResendEmail({
      to: parsed.data.email,
      from: resolveScenarioFrom(scenario, "inquiry_auto_reply_from"),
      subject: renderEmailTemplate(templates.inquiryAutoReplySubject, vars),
      text: renderEmailTemplate(templates.inquiryAutoReplyBody, vars),
    });
  } catch (err) {
    // お客様への自動返信の失敗で、社内通知・お客様への送信完了扱い自体を失敗させない
    console.error("[inquiries] failed to send auto-reply", err);
  }

  return NextResponse.json({ ok: true });
}
