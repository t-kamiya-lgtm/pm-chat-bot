"use client";

import { useState } from "react";

/**
 * 絞り込みフォームを、既定では「絞り込みメニュー ▼」の縮小表示にしておき、
 * クリックで展開する。スティッキー表示のヘッダー内で使う想定(常時展開だと
 * ヘッダーが高くなり過ぎるため)。
 */
export function CollapsibleFilterBar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
      >
        絞り込みメニュー
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
