import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAdminAuth } from "@/lib/firebase/admin";

export const SESSION_COOKIE_NAME = "admin_session";
// 12時間(既存の1時間アイドルログアウトがUX上の主な制御であり続けるため、
// Firebaseセッションcookieの上限である2週間よりかなり短く設定している)
const SESSION_EXPIRES_IN_MS = 12 * 60 * 60 * 1000;

const sessionSchema = z.object({
  idToken: z.string().min(1),
});

/**
 * クライアントがGoogleサインインで取得したIDトークンを受け取り、
 * HttpOnlyのセッションCookieを発行する。以後のサーバー側の認証判定
 * (src/lib/auth.ts の getCurrentAppUser)はこのCookieを検証して行う。
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "idTokenが必要です" }, { status: 400 });
  }

  try {
    const auth = getAdminAuth();
    // createSessionCookie自体もトークンの正当性を検証するが、有効期限切れ等の
    // 早期エラーメッセージを分かりやすくするため事前にverifyIdTokenも行う
    await auth.verifyIdToken(parsed.data.idToken);
    const sessionCookie = await auth.createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_EXPIRES_IN_MS,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_EXPIRES_IN_MS / 1000,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/session] failed to create session cookie", err);
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }
}

/** ログアウト時に呼び出し、サーバー側のセッションCookieを破棄する。 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
