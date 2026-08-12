import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { InviteUserForm } from "@/components/admin/InviteUserForm";
import { UsersTable } from "@/components/admin/UsersTable";

export const dynamic = "force-dynamic";

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

      <UsersTable users={users ?? []} />
    </div>
  );
}
