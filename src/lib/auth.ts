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
 * 初回ログイン時は role="unassigned" で自動作成する(要件定義書 4.6)。
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

  const { data: created, error } = await admin
    .from("users")
    .insert({ auth_user_id: authUser.id, email: authUser.email, role: "unassigned" })
    .select("*")
    .single();

  if (error) {
    // メールアドレスが既存レコードと重複している場合は auth_user_id を紐付ける
    const { data: byEmail } = await admin
      .from("users")
      .update({ auth_user_id: authUser.id })
      .eq("email", authUser.email)
      .select("*")
      .maybeSingle();
    if (byEmail) return toAppUser(byEmail);
    throw error;
  }

  return toAppUser(created);
}

export function canManageCatalog(user: AppUser | null): boolean {
  return user?.role === "admin" || user?.role === "staff";
}

export function canManageUsers(user: AppUser | null): boolean {
  return user?.role === "admin";
}
