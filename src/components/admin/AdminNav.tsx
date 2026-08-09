"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "実績ダッシュボード" },
  { href: "/admin/scenarios", label: "シナリオ" },
  { href: "/admin/faqs", label: "商品QA" },
  { href: "/admin/orders", label: "注文" },
  { href: "/admin/coupons", label: "クーポン" },
  { href: "/admin/leads", label: "アクセスログ" },
  { href: "/admin/checkout-fields", label: "決済フォーム設定" },
  { href: "/admin/business-days", label: "営業日設定" },
];

const CATALOG_ITEMS = [
  { href: "/admin/brands", label: "ブランド" },
  { href: "/admin/product-groups", label: "アイテム" },
  { href: "/admin/products", label: "商品(品番)" },
];

const linkClass = "text-neutral-600 transition-colors hover:text-neutral-900 active:text-blue-600";

export function AdminNav() {
  const [catalogOpen, setCatalogOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-3 text-sm">
      <nav className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => setCatalogOpen((prev) => !prev)}
          className={`flex items-center gap-1 ${linkClass}`}
        >
          商品登録
          <span className={`text-xs transition-transform ${catalogOpen ? "rotate-180" : ""}`}>▼</span>
        </button>
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass}>
            {item.label}
          </Link>
        ))}
        <Link href="/admin/users" className={linkClass}>
          ログイン者一覧
        </Link>
      </nav>
      {catalogOpen && (
        <div className="mt-2 flex flex-wrap gap-4 border-t border-neutral-100 pt-2 pl-4 text-sm">
          {CATALOG_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
