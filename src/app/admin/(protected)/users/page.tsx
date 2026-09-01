import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getCurrentAppUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/db/schema";
import { InviteUserForm } from "@/components/admin/InviteUserForm";
import { UsersTable, type UserRow } from "@/components/admin/UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) redirect("/admin/login");
  if (currentUser.role !== "admin") redirect("/admin");

  let userRows: UserRow[] = [];
  try {
    const db = await getDb();
    const rows = await db.select().from(users).orderBy(desc(users.createdAt));
    userRows = rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      created_at: u.createdAt,
    }));
  } catch (err) {
    console.error("[admin/users] failed to load users", err);
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">ユーザー権限</h1>
      <p className="mb-6 text-sm text-neutral-500">
        招待制です。以下からメールアドレスと権限を指定して招待してください。招待済みのメールアドレスで
        許可ドメインのGoogleアカウントにログインすると、指定した権限で管理画面を利用できます。
      </p>

      <InviteUserForm />

      <UsersTable users={userRows} />
    </div>
  );
}
