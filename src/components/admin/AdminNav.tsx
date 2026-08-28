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
      { href: "/admin/subscription-analysis-v2", label: "定期分析(新)" },
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
      { href: "/admin/bundle-insert-sets", label: "同梱物設定" },
      { href: "/admin/tax-rates", label: "税率設定" },
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
    ],
  },
];

const linkClass = "text-neutral-600 transition-colors hover:text-neutral-900 active:text-blue-600";
const activeLinkClass = "font-semibold text-blue-600";

/**
 * 管理画面共通ナビゲーション。PC/スマホ共通で、ヘッダーの「メニュー」ボタンを押すと
 * 左寄せのパネルが開き、大メニュー(グループ)→中メニュー(項目)の順にアコーディオンで
 * 辿る。メニュー項目をクリックして遷移するとパネルは自動的に閉じる。
 */
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(
    () => visibleGroups.find(groupActive)?.key ?? null,
  );
  const shownGroupKey = openGroupKey ?? visibleGroups.find(groupActive)?.key ?? null;
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => subscribeUnsavedChanges(() => setDirty(hasUnsavedChanges())), []);

  /**
   * メニュー項目のリンクタッチを横取りする。編集中で未保存の内容がある場合は、
   * 遷移前に保存確認ポップアップを表示する。
   */
  function handleLinkClick(e: React.MouseEvent, href: string) {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      setPendingHref(href);
      return;
    }
    setMenuOpen(false);
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
    setMenuOpen(false);
    if (href) router.push(href);
  }

  return (
    <div className="relative mx-auto max-w-5xl px-6 pb-3 text-sm">
      {pendingHref && (
        <SaveConfirmDialog saving={saving} onCancel={() => setPendingHref(null)} onSave={handleConfirmSave} />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
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
        <span className={`truncate ${activeLinkClass}`}>
          {allItems.find((item) => isActive(item.href))?.label ?? "メニュー"}
        </span>
      </div>

      {menuOpen && (
        <div className="mt-2 w-full space-y-1 rounded-md border border-neutral-200 bg-white p-3 text-sm shadow-lg sm:absolute sm:left-6 sm:w-72 sm:shadow-xl">
          {visibleGroups.map((group) => {
            const active = groupActive(group);
            const open = shownGroupKey === group.key;
            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => setOpenGroupKey((prev) => (prev === group.key ? null : group.key))}
                  className={`flex w-full items-center justify-between rounded-md px-1.5 py-1.5 ${
                    active ? `${activeLinkClass} bg-blue-50` : linkClass
                  }`}
                >
                  {group.label}
                  <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
                </button>
                {open && (
                  <div className="flex flex-col gap-0.5 py-1 pl-4">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => handleLinkClick(e, item.href)}
                        className={`rounded-md px-1.5 py-1.5 ${isActive(item.href) ? activeLinkClass : linkClass}`}
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
