import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/dashboard", label: "実績ダッシュボード" },
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

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-semibold">チャットボット決済システム 管理画面</span>
          <span className="text-sm text-neutral-500">{user.email}</span>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-4 px-6 pb-3 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="text-neutral-600 transition-colors hover:text-neutral-900 active:text-blue-600">
              {item.label}
            </Link>
          ))}
          <Link href="/admin/users" className="text-neutral-600 transition-colors hover:text-neutral-900 active:text-blue-600">
            ログイン者一覧
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
