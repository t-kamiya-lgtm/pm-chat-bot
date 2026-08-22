"use client";

/**
 * 「保存しますか？」の確認ポップアップ。編集中のノードの外をタッチした時、
 * および未保存の編集中にグローバルメニューのリンクをタッチした時に表示する。
 */
export function SaveConfirmDialog({
  onSave,
  onCancel,
  saving,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="alertdialog" className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
        <p className="mb-4 text-sm text-neutral-700">
          保存されていない変更があります。保存しますか？
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}
