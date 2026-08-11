import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "@/lib/types";

function toAppUser(row: {
  id: string;
  auth_user_id: string | null;
  email: string;
  role: string;
  created_at: string;
}): AppUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    role: row.role as AppUser["role"],
    createdAt: row.created_at,
  };
}

/**
 * ログイン中のGoogleアカウントに対応する管理画面ユーザーを取得する。
 * 招待制: 管理者が事前に「ユーザー権限」画面でメールアドレス・権限を登録した場合のみ、
 * 初回ログイン時にそのレコードへauth_user_idを紐付ける。未登録のメールアドレスは
 * 許可ドメイン内であってもログインできない(自動での新規admin作成は行わない)。
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email) return null;

  const allowedDomain = process.env.ADMIN_ALLOWED_GOOGLE_DOMAIN;
  if (allowedDomain && !authUser.email.endsWith(`@${allowedDomain}`)) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("users")
    .select("*")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (existing) return toAppUser(existing);

  // 招待済み(管理者が事前に登録したメールアドレス)であれば、この認証情報を紐付ける
  const { data: invited } = await admin
    .from("users")
    .update({ auth_user_id: authUser.id })
    .eq("email", authUser.email)
    .is("auth_user_id", null)
    .select("*")
    .maybeSingle();

  return invited ? toAppUser(invited) : null;
}
