import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/app/api/auth/session/route";

/**
 * Firebaseセッションcookieは(Supabaseの自動リフレッシュ付きJWTと違い)ここで
 * リフレッシュする必要がないため、Cookieの有無だけを見た軽量なチェックに留める。
 * 実際の検証(署名・有効期限・招待済みメールとの紐付け)はgetCurrentAppUser()
 * (Server Component / API route側)で行う。
 *
 * /admin/login自体はこのmatcherに含まれるため、ログイン画面へのリダイレクトの
 * 無限ループを避けるためログイン画面自体は対象外にする。
 */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
