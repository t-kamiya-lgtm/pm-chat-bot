import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/require-role";
import { exchangeSmaregiCodeForToken } from "@/lib/smaregi-oauth";

const STATE_COOKIE = "smaregi_oauth_state";

/** スマレジEC・リピートの許可ページからのリダイレクト先。認可コードをアクセストークンに交換する。 */
export async function GET(request: Request) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = request.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split("=")[1];

  const redirectTo = new URL("/admin/smaregi", request.url);

  if (!code || !state || !savedState || state !== savedState) {
    redirectTo.searchParams.set("smaregi_oauth", "state_mismatch");
    const response = NextResponse.redirect(redirectTo);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  try {
    await exchangeSmaregiCodeForToken(code);
    redirectTo.searchParams.set("smaregi_oauth", "connected");
  } catch (err) {
    console.error("[smaregi/oauth/callback] failed to exchange code", err);
    redirectTo.searchParams.set("smaregi_oauth", "error");
  }

  const response = NextResponse.redirect(redirectTo);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
