import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/require-role";
import { getSmaregiAuthorizeUrl } from "@/lib/smaregi-oauth";

const STATE_COOKIE = "smaregi_oauth_state";

/** スマレジEC・リピートの許可ページへ遷移する(admin限定)。CSRF対策のstateを一時cookieに保存する。 */
export async function GET() {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(getSmaregiAuthorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
