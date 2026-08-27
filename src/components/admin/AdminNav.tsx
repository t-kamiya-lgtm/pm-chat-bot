"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { hasUnsavedChanges, subscribeUnsavedChanges, triggerSave } from "@/lib/unsaved-changes";
import { SaveConfirmDialog } from "@/components/admin/SaveConfirmDialog";

interface NavItem {
  href: string;
  label: string;
  adminOnly?: boolean;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/** ダッシュボード(/admin)のカード分類と揃えた5つの大メニュー。 */
const NAV_GROUPS: NavGroup[] = [
  {
    key: "performance",
    label: "実績",
    items: [
      { href: "/admin/dashboard", label: "実績ダッシュボード" },
      { href: "/admin/leads", label: "アクセスログ" },
    ],
  },
  {
    key: "catalog",
    label: "商品管理",
    items: [
      { href: "/admin/brands", label: "ブランド管理" },
      { href: "/admin/product-groups", label: "アイテム管理" },
      { href: "/admin/products", label: "商品(品番)管理" },
      { href: "/admin/faqs", label: "商品QA" },
    ],
  },
  {
    key: "scenario",
    label: "シナリオ管理",
    items: [
      { href: "/admin/scenarios", label: "シナリオ" },
      { href: "/admin/coupons", label: "クーポン" },
    ],
  },
  {
    key: "orders",
    label: "注文管理",
    items: [
      { href: "/admin/orders", label: "注文一覧" },
      { href: "/admin/customers", label: "顧客管理" },
    ],
  },
  {
    key: "settings",
    label: "設定",
    items: [
      { href: "/admin/checkout-fields", label: "基本設定" },
      { href: "/admin/email-settings", label: "メール設定" },
      { href: "/admin/business-days", label: "営業日設定" },
      { href: "/admin/users", label: "ユーザー権限", adminOnly: true },
      { href: "/admin/smaregi", label: "スマレジ連携", adminOnly: true },
    ],
  },
];

const linkClass = "text-neutral-600 transition-colors hover:text-neutral-900 active:text-blue-600";
const activeLinkClass = "font-semibold text-blue-600";

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
  }

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0);

  function groupActive(group: NavGroup) {
    return group.items.some((item) => isActive(item.href));
  }

  const allItems = visibleGroups.flatMap((g) => g.items);

  const [openGroupKey, setOpenGroupKey] = useState<string | null>(
    () => visibleGroups.find(groupActive)?.key ?? null,
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileOpenGroupKey, setMobileOpenGroupKey] = useState<string | null>(
    () => visibleGroups.find(groupActive)?.key ?? null,
  );
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => subscribeUnsavedChanges(() => setDirty(hasUnsavedChanges())), []);

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

      {/* デスクトップ表示: 大メニュー(▼)ごとに中メニューを展開する */}
      <nav className="hidden flex-wrap items-center gap-4 sm:flex">
        {visibleGroups.map((group) => {
          const active = groupActive(group);
          const open = openGroupKey === group.key;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => setOpenGroupKey((prev) => (prev === group.key ? null : group.key))}
              className={`flex items-center gap-1 ${active ? activeLinkClass : linkClass}`}
            >
              {group.label}
              <span className={`text-xs transition-transform ${open || active ? "rotate-180" : ""}`}>▼</span>
            </button>
          );
        })}
      </nav>
      {visibleGroups.map((group) => {
        const open = openGroupKey === group.key || groupActive(group);
        if (!open) return null;
        return (
          <div
            key={group.key}
            className="mt-2 hidden flex-wrap gap-4 border-t border-neutral-100 pt-2 pl-4 text-sm sm:flex"
          >
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? activeLinkClass : linkClass}>
                {item.label}
              </Link>
            ))}
          </div>
        );
      })}

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
        <div className="mt-2 space-y-1 rounded-md border border-neutral-200 bg-white p-3 text-sm sm:hidden">
          {visibleGroups.map((group) => {
            const active = groupActive(group);
            const open = mobileOpenGroupKey === group.key || active;
            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() =>
                    setMobileOpenGroupKey((prev) => (prev === group.key ? null : group.key))
                  }
                  className={`flex w-full items-center justify-between py-1.5 ${
                    active ? activeLinkClass : linkClass
                  }`}
                >
                  {group.label}
                  <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
                </button>
                {open && (
                  <div className="grid grid-cols-2 gap-2 py-1 pl-3">
                    {group.items.map((item) => (
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
          })}
        </div>
      )}
    </div>
  );
}
