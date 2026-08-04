import { redirect } from "next/navigation";
import { getCurrentAppUser, canManageUsers } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UserRoleSelect } from "@/components/admin/UserRoleSelect";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const currentUser = await getCurrentAppUser();
  if (!canManageUsers(currentUser)) {
    redirect("/admin");
  }

  const supabase = createSupabaseAdminClient();
  const { data: users } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">ユーザー権限</h1>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">メールアドレス</th>
              <th className="px-4 py-2">権限</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">
                  <UserRoleSelect userId={u.id} role={u.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
