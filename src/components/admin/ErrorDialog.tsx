"use client";

/**
 * 操作をブロックしたときの理由を確認させるためのポップアップ。
 * トーストは数秒で消えてしまうため、対処が必要なエラー(該当箇所の一覧を読ませたい場合など)はこちらを使う。
 */
export function ErrorDialog({
  title,
  description,
  items,
  onClose,
}: {
  title: string;
  description?: string;
  items?: string[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="alertdialog" className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <p className="mb-2 text-sm font-semibold text-red-700">{title}</p>
        {description && (
          <p className="mb-3 text-sm whitespace-pre-wrap text-neutral-700">{description}</p>
        )}
        {items && items.length > 0 && (
          <ul className="mb-3 max-h-60 list-disc space-y-1 overflow-y-auto rounded bg-sky-50 p-3 pl-7 text-xs text-neutral-700">
            {items.map((item, index) => (
              <li key={index} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
