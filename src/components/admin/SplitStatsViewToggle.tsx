"use client";

import { useState } from "react";

type Tab = "total" | "detail";

/** サーバー側で組み立て済みの「合計」「明細(定期・単品)」の2つの表示を、タブで切り替える。 */
export function SplitStatsViewToggle({
  totalView,
  detailView,
}: {
  totalView: React.ReactNode;
  detailView: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("total");

  return (
    <div>
      <div className="mb-2 flex gap-1">
        <TabButton active={tab === "total"} onClick={() => setTab("total")}>
          合計
        </TabButton>
        <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
          明細(定期・単品)
        </TabButton>
      </div>
      {tab === "total" ? totalView : detailView}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`print:hidden rounded-md px-2.5 py-1 text-xs font-medium ${
        active ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}
