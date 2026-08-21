import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { IdleLogout } from "@/components/admin/IdleLogout";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    // 背景を薄いブルーにして、白いカード・入力欄との境目が分かるようにする
    <div className="min-h-screen bg-sky-50">
      <IdleLogout />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="font-semibold hover:text-neutral-700">
            チャットボット決済システム 管理画面
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
        <AdminNav isAdmin={user.role === "admin"} />
      </header>
      <main className="mx-auto max-w-screen-2xl px-6 py-8">{children}</main>
    </div>
  );
}
