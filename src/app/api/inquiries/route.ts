import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInquiryNotification } from "@/lib/email";

const inquirySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(1),
  productName: z.string().optional(),
});

/**
 * チャット内埋め込みの問い合わせフォーム(要件定義書 4.7)。
 * DBには永続化せず、担当者へのメール通知のみ行う。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await sendInquiryNotification(parsed.data);
  return NextResponse.json({ ok: true });
}
