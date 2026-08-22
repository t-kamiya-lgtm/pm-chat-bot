"use client";

/**
 * 「編集中で未保存の内容があるか」を、離れたコンポーネント間(グローバルメニュー ⇔
 * 各ページの編集フォーム)で共有するための小さなストア。
 * 画面全体で1つの編集フォームだけが開いている想定の単純なカウンタ方式。
 * (Reactコンテキストではなくモジュール変数にしているのは、AdminNavと各ページの
 * 編集フォームがレイアウト上の兄弟要素で、共通の親を経由したprops受け渡しがしづらいため)
 */
type Listener = () => void;

let editingCount = 0;
let saveHandler: (() => Promise<void> | void) | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** 編集を開始したフォームが呼ぶ。対応するmarkEditingEndを必ず1回呼ぶこと。 */
export function markEditingStart() {
  editingCount += 1;
  notify();
}

export function markEditingEnd() {
  editingCount = Math.max(0, editingCount - 1);
  notify();
}

export function hasUnsavedChanges(): boolean {
  return editingCount > 0;
}

/** 現在編集中のフォームの保存処理を登録する(グローバルメニュー側から呼び出すため)。 */
export function registerSaveHandler(fn: (() => Promise<void> | void) | null) {
  saveHandler = fn;
}

export async function triggerSave(): Promise<void> {
  await saveHandler?.();
}

export function subscribeUnsavedChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
