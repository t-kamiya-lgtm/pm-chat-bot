"use client";

import { useState } from "react";

export interface TabDef {
  key: string;
  label: string;
  /** スマホ幅などで折り返さずに1行へ収めるための短縮ラベル。未指定時はlabelを使う。 */
  shortLabel?: string;
  content: React.ReactNode;
}

/**
 * 複数のパネルをタブで切り替える。パネルはすべて事前にサーバー側で計算済みの内容を
 * 受け取り、切り替えは表示/非表示のCSS切り替えのみ(再取得・再計算なし)。
 * タブ間の行き来が多いUIで、都度読み込みを避けるために使う。
 * タブは折り返さず横一列に均等割りし、収まらない場合のみ横スクロールする。
 * 印刷時はタブ切り替えボタンを隠し、全パネルを表示する(PDF出力に全内容を含めるため)。
 */
export function TabbedPanels({
  tabs,
  className = "",
  initialActiveKey,
}: {
  tabs: TabDef[];
  className?: string;
  /** 初期表示するタブのkey。未指定・該当なしの場合は先頭のタブを表示する。 */
  initialActiveKey?: string;
}) {
  const [active, setActive] = useState(
    initialActiveKey && tabs.some((t) => t.key === initialActiveKey) ? initialActiveKey : (tabs[0]?.key ?? ""),
  );
  return (
    <div className={className}>
      <div className="print:hidden mb-4 flex flex-nowrap gap-1 overflow-x-auto border-b border-neutral-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`-mb-px min-w-0 flex-1 truncate rounded-t-md border px-2 py-2 text-center text-xs font-medium sm:px-4 sm:text-sm ${
              active === tab.key
                ? "border-neutral-200 border-b-white bg-white text-blue-700"
                : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-white hover:text-neutral-700"
            }`}
          >
            <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.key} className={active === tab.key ? "" : "hidden print:block print:mt-10"}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
