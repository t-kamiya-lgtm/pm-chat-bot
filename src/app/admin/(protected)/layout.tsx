import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser, canManageUsers } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/brands", label: "ブランド" },
  { href: "/admin/product-groups", label: "アイテム" },
  { href: "/admin/products", label: "商品(品番)" },
  { href: "/admin/scenarios", label: "シナリオ" },
  { href: "/admin/faqs", label: "商品QA" },
  { href: "/admin/orders", label: "注文" },
  { href: "/admin/leads", label: "アクセスログ" },
  { href: "/admin/checkout-fields", label: "決済フォーム設定" },
  { href: "/admin/business-days", label: "営業日設定" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/admin/login");
  }

  if (user.role === "unassigned") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
        <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="font-medium text-amber-900">
            アカウントは作成されましたが、まだ権限が付与されていません。
          </p>
          <p className="mt-2 text-sm text-amber-800">
            管理者に権限付与を依頼してください({user.email})。
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-semibold">チャットボット決済システム 管理画面</span>
          <span className="text-sm text-neutral-500">
            {user.email}({user.role === "admin" ? "管理者" : "一般ユーザー"})
          </span>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-4 px-6 pb-3 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="text-neutral-600 hover:text-neutral-900">
              {item.label}
            </Link>
          ))}
          {canManageUsers(user) && (
            <Link href="/admin/users" className="text-neutral-600 hover:text-neutral-900">
              ユーザー権限
            </Link>
          )}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
