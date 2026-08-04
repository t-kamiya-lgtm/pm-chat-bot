"use client";

import { useEffect } from "react";

/** 保存/更新完了などの案内をポップアップ表示する。数秒後に自動で消える。 */
export function Toast({
  message,
  type = "success",
  onDismiss,
}: {
  message: string;
  type?: "success" | "error";
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        role="status"
        className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
          type === "success" ? "bg-neutral-900" : "bg-red-600"
        }`}
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-white/70 hover:text-white"
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
