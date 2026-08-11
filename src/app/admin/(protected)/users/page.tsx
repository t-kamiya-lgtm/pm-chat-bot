import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm } from "@/components/admin/InviteUserForm";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  staff: "スタッフ",
  unassigned: "未割り当て",
};

export default async function AdminUsersPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/admin/login");
  if (currentUser.role !== "admin") redirect("/admin");

  const supabase = createSupabaseAdminClient();
  const { data: users } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">ユーザー権限</h1>
      <p className="mb-6 text-sm text-neutral-500">
        招待制です。以下からメールアドレスと権限を指定して招待してください。招待済みのメールアドレスで
        許可ドメインのGoogleアカウントにログインすると、指定した権限で管理画面を利用できます。
      </p>

      <InviteUserForm />

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">メールアドレス</th>
              <th className="px-4 py-2">権限</th>
              <th className="px-4 py-2">登録日</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{ROLE_LABELS[u.role as UserRole] ?? u.role}</td>
                <td className="px-4 py-2">{new Date(u.created_at).toLocaleDateString("ja-JP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
