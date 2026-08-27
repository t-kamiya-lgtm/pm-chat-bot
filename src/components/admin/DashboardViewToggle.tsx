"use client";

import { useState } from "react";

/** サーバー側で組み立て済みの2つの表示(一覧/ピボット)を、ボタンで切り替えて表示する。 */
export function DashboardViewToggle({
  listView,
  pivotView,
  pivotLabel,
}: {
  listView: React.ReactNode;
  pivotView: React.ReactNode;
  pivotLabel: string;
}) {
  const [showPivot, setShowPivot] = useState(false);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShowPivot((v) => !v)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showPivot ? "一覧表示に戻す" : `${pivotLabel}で見る`}
        </button>
      </div>
      {showPivot ? pivotView : listView}
    </div>
  );
}
