"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hasUnsavedChanges, subscribeUnsavedChanges, triggerSave } from "@/lib/unsaved-changes";
import { SaveConfirmDialog } from "@/components/admin/SaveConfirmDialog";

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
  { href: "/admin/email-addresses", label: "メールアドレス管理" },
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
  const router = useRouter();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => subscribeUnsavedChanges(() => setDirty(hasUnsavedChanges())), []);

  function isActive(href: string) {
    return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
  }

  const catalogActive = CATALOG_ITEMS.some((item) => isActive(item.href));

  const allItems = [
    ...NAV_ITEMS,
    ...CATALOG_ITEMS,
    ...(isAdmin ? [{ href: "/admin/smaregi", label: "スマレジ連携" }] : []),
    ...(isAdmin ? [{ href: "/admin/users", label: "ユーザー権限" }] : []),
  ];

  /**
   * グローバルメニュー(スマホの「⋯」から開くメニュー)のリンクタッチを横取りする。
   * 編集中で未保存の内容がある場合は、遷移前に保存確認ポップアップを表示する。
   */
  function handleMobileLinkClick(e: React.MouseEvent, href: string) {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      setPendingHref(href);
      return;
    }
    setMobileMenuOpen(false);
  }

  async function handleConfirmSave() {
    setSaving(true);
    try {
      await triggerSave();
    } finally {
      setSaving(false);
    }
    const href = pendingHref;
    setPendingHref(null);
    setMobileMenuOpen(false);
    if (href) router.push(href);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-3 text-sm">
      {pendingHref && (
        <SaveConfirmDialog saving={saving} onCancel={() => setPendingHref(null)} onSave={handleConfirmSave} />
      )}

      {/* デスクトップ表示: 常時展開のナビ */}
      <nav className="hidden flex-wrap items-center gap-4 sm:flex">
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
        <div className="mt-2 hidden flex-wrap gap-4 border-t border-neutral-100 pt-2 pl-4 text-sm sm:flex">
          {CATALOG_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? activeLinkClass : linkClass}>
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* スマホ表示: 現在地のみ表示し、「⋯」でメニュー全体を展開する
          (フルのナビを常時表示すると複数行に折り返してヘッダーが長くなり、スクロールで隠れやすいため) */}
      <div className="flex items-center justify-between sm:hidden">
        <span className={`truncate ${activeLinkClass}`}>
          {allItems.find((item) => isActive(item.href))?.label ?? "メニュー"}
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="メニューを開く"
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 hover:bg-neutral-50"
        >
          ⋯
          {dirty && (
            <span
              title="保存されていない変更があります"
              className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"
            />
          )}
        </button>
      </div>
      {mobileMenuOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-neutral-200 bg-white p-3 text-sm sm:hidden">
          {allItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => handleMobileLinkClick(e, item.href)}
              className={`truncate ${isActive(item.href) ? activeLinkClass : linkClass}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
