"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "実績ダッシュボード" },
  { href: "/admin/scenarios", label: "シナリオ" },
  { href: "/admin/faqs", label: "商品QA" },
  { href: "/admin/orders", label: "注文" },
  { href: "/admin/customers", label: "顧客管理" },
  { href: "/admin/coupons", label: "クーポン" },
  { href: "/admin/leads", label: "アクセスログ" },
  { href: "/admin/checkout-fields", label: "決済フォーム設定" },
  { href: "/admin/email-templates", label: "自動メール設定" },
  { href: "/admin/business-days", label: "営業日設定" },
];

const CATALOG_ITEMS = [
  { href: "/admin/brands", label: "ブランド" },
  { href: "/admin/product-groups", label: "アイテム" },
  { href: "/admin/products", label: "商品(品番)" },
];

const linkClass = "text-neutral-600 transition-colors hover:text-neutral-900 active:text-blue-600";
const activeLinkClass = "font-semibold text-blue-600";

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [catalogOpen, setCatalogOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
  }

  const catalogActive = CATALOG_ITEMS.some((item) => isActive(item.href));

  return (
    <div className="mx-auto max-w-5xl px-6 pb-3 text-sm">
      <nav className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setCatalogOpen((prev) => !prev)}
          className={`flex items-center gap-1 ${catalogActive ? activeLinkClass : linkClass}`}
        >
          商品登録
          <span className={`text-xs transition-transform ${catalogOpen || catalogActive ? "rotate-180" : ""}`}>
            ▼
          </span>
        </button>
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={isActive(item.href) ? activeLinkClass : linkClass}>
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link href="/admin/smaregi" className={isActive("/admin/smaregi") ? activeLinkClass : linkClass}>
            スマレジ連携
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin/users" className={isActive("/admin/users") ? activeLinkClass : linkClass}>
            ユーザー権限
          </Link>
        )}
      </nav>
      {(catalogOpen || catalogActive) && (
        <div className="mt-2 flex flex-wrap gap-4 border-t border-neutral-100 pt-2 pl-4 text-sm">
          {CATALOG_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? activeLinkClass : linkClass}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
