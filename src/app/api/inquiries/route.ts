import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInquiryNotification, sendResendEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEmailTemplates, renderEmailTemplate } from "@/lib/email-templates";

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

  await sendInquiryNotification(notificationInput);

  try {
    const supabase = createSupabaseAdminClient();
    const [templates, scenario] = await Promise.all([
      getEmailTemplates(supabase),
      scenarioId
        ? supabase.from("scenarios").select("email_from_address").eq("id", scenarioId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const vars = { customer_name: parsed.data.name, message: parsed.data.message };
    await sendResendEmail({
      to: parsed.data.email,
      from: scenario.data?.email_from_address || process.env.ORDER_EMAIL_FROM || "chatbot@example.com",
      subject: renderEmailTemplate(templates.inquiryAutoReplySubject, vars),
      text: renderEmailTemplate(templates.inquiryAutoReplyBody, vars),
    });
  } catch (err) {
    // お客様への自動返信の失敗で、社内通知・お客様への送信完了扱い自体を失敗させない
    console.error("[inquiries] failed to send auto-reply", err);
  }

  return NextResponse.json({ ok: true });
}
