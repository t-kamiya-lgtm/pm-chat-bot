import { sendResendEmail } from "@/lib/email";
import type { UserRole } from "@/lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  staff: "スタッフ",
  unassigned: "未割り当て",
};

/**
 * 管理画面への招待メールを送る。ログインはGoogle認証のみのため、案内リンクを送るだけの内容とする。
 * 戻り値は「実際にメール送信を試みたか」(false = RESEND_API_KEY未設定でログ出力のみ)。
 */
export async function sendUserInviteEmail(input: {
  to: string;
  role: UserRole;
  invitedByEmail: string;
}): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const loginUrl = `${siteUrl}/admin/login`;

  return sendResendEmail({
    to: input.to,
    from: process.env.ORDER_EMAIL_FROM ?? "chatbot@example.com",
    subject: "【チャットボット管理画面】ご招待のお知らせ",
    text: `チャットボット管理画面への招待が届きました。

権限: ${ROLE_LABELS[input.role]}
招待者: ${input.invitedByEmail}

以下のリンクから、このメールアドレスに紐づくGoogleアカウントでログインしてください。
${loginUrl}

ご不明な点があれば、招待者にお問い合わせください。`,
  });
}
