import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const supabase = createSupabaseAdminClient();
  const { data: users } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">ログイン者一覧</h1>
      <p className="mb-6 text-sm text-neutral-500">
        許可ドメインのGoogleアカウントでログインすると、すべての管理画面機能を利用できます。
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">メールアドレス</th>
              <th className="px-4 py-2">初回ログイン日</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{new Date(u.created_at).toLocaleDateString("ja-JP")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
