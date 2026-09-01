import { cookies } from "next/headers";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/db/schema";
import { getAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/app/api/auth/session/route";
import type { AppUser } from "@/lib/types";

function toAppUser(row: typeof users.$inferSelect): AppUser {
  return {
    id: row.id,
    authUserId: row.authUserId,
    email: row.email,
    role: row.role as AppUser["role"],
    createdAt: row.createdAt,
  };
}

/**
 * ログイン中のGoogleアカウントに対応する管理画面ユーザーを取得する。
 * 招待制: 管理者が事前に「ユーザー権限」画面でメールアドレス・権限を登録した場合のみ、
 * 初回ログイン時にそのレコードへauth_user_id(FirebaseのUID)を紐付ける。未登録のメール
 * アドレスは許可ドメイン内であってもログインできない(自動での新規admin作成は行わない)。
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  let decoded;
  try {
    decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
  if (!decoded.email) return null;

  const allowedDomain = process.env.ADMIN_ALLOWED_GOOGLE_DOMAIN;
  if (allowedDomain && !decoded.email.endsWith(`@${allowedDomain}`)) {
    return null;
  }

  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.authUserId, decoded.uid)).limit(1);
  if (existing) return toAppUser(existing);

  // 招待済み(管理者が事前に登録したメールアドレス)であれば、この認証情報を紐付ける
  const [invited] = await db
    .update(users)
    .set({ authUserId: decoded.uid })
    .where(and(eq(users.email, decoded.email), isNull(users.authUserId)))
    .returning();

  return invited ? toAppUser(invited) : null;
}
