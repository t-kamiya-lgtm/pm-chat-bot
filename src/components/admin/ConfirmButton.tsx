"use client";

import { useState } from "react";

/**
 * window.confirm()の代替。モバイルSafari等、環境によってはconfirm/promptダイアログが
 * 表示されないことがあるため、画面内のUIで削除確認を行う。
 */
export function ConfirmButton({
  label,
  confirmLabel = "本当に削除しますか？",
  disabled,
  onConfirm,
  className,
}: {
  label: string;
  confirmLabel?: string;
  disabled?: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-neutral-500">{confirmLabel}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          className="text-red-600 hover:underline disabled:opacity-30"
        >
          はい
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-neutral-500 hover:underline">
          いいえ
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className={className ?? "text-xs text-red-600 hover:underline disabled:opacity-30"}
    >
      {label}
    </button>
  );
}
