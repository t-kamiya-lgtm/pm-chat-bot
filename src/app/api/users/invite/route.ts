import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminRole } from "@/lib/require-role";
import { sendUserInviteEmail } from "@/lib/user-invite";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "staff"]),
});

/**
 * 管理画面ユーザーの招待(admin限定)。
 * usersテーブルにメールアドレス・権限を登録するだけで、実際の認証はGoogleログイン時に
 * auth.ts側でこのメールアドレスと紐付ける(招待制)。あわせて招待メールを送信する。
 */
export async function POST(request: Request) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, role } = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("users")
    .upsert({ email, role }, { onConflict: "email", ignoreDuplicates: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await sendUserInviteEmail({ to: email, role, invitedByEmail: roleCheck.user.email });
  } catch (err) {
    console.error("[users/invite] failed to send invite email", { email, err });
    return NextResponse.json(
      { ok: true, emailSent: false, warning: "ユーザーは登録されましたが、招待メールの送信に失敗しました" },
    );
  }

  return NextResponse.json({ ok: true, emailSent: true });
}
