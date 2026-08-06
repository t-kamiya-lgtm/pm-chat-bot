"use client";

import { useState } from "react";
import { Toast } from "@/components/admin/Toast";

export interface GreetingItemDraft {
  type: "image" | "text";
  imageUrl: string;
  linkUrl: string;
  text: string;
}

const MAX_ITEMS = 5;
const EMPTY_ITEM: GreetingItemDraft = { type: "text", imageUrl: "", linkUrl: "", text: "" };

function GreetingItemsEditor({
  label,
  description,
  items,
  onChange,
}: {
  label: string;
  description: string;
  items: GreetingItemDraft[];
  onChange: (items: GreetingItemDraft[]) => void;
}) {
  function update(index: number, patch: Partial<GreetingItemDraft>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }
  function add() {
    if (items.length >= MAX_ITEMS) return;
    onChange([...items, { ...EMPTY_ITEM }]);
  }

  return (
    <div className="space-y-3 rounded-md border border-neutral-200 p-4">
      <div>
        <p className="text-sm font-medium text-neutral-700">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>

      {items.map((item, index) => (
        <div key={index} className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">項目 {index + 1}</span>
            <button
              type="button"
              onClick={() => remove(index)}
              className="text-xs text-red-600 hover:underline"
            >
              削除
            </button>
          </div>

          <div className="flex gap-4 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={item.type === "text"}
                onChange={() => update(index, { type: "text" })}
              />
              コメント入力
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={item.type === "image"}
                onChange={() => update(index, { type: "image" })}
              />
              画像アップロード(+リンク)
            </label>
          </div>

          {item.type === "text" ? (
            <textarea
              className="input"
              rows={3}
              placeholder="コメント本文"
              value={item.text}
              onChange={(e) => update(index, { text: e.target.value })}
            />
          ) : (
            <>
              <input
                className="input"
                placeholder="画像URL"
                value={item.imageUrl}
                onChange={(e) => update(index, { imageUrl: e.target.value })}
              />
              <input
                className="input"
                placeholder="リンクURL(任意・画像タップ時に開く)"
                value={item.linkUrl}
                onChange={(e) => update(index, { linkUrl: e.target.value })}
              />
            </>
          )}
        </div>
      ))}

      {items.length === 0 && <p className="text-xs text-neutral-400">項目がまだありません</p>}

      <button
        type="button"
        onClick={add}
        disabled={items.length >= MAX_ITEMS}
        className="text-xs text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline"
      >
        + 項目を追加({items.length}/{MAX_ITEMS})
      </button>
    </div>
  );
}

interface RawGreetingItem {
  type: "image" | "text";
  imageUrl?: string;
  linkUrl?: string;
  text?: string;
}

function toDraft(items: RawGreetingItem[]): GreetingItemDraft[] {
  return items.map((item) => ({
    type: item.type,
    imageUrl: item.imageUrl ?? "",
    linkUrl: item.linkUrl ?? "",
    text: item.text ?? "",
  }));
}

function toPayload(items: GreetingItemDraft[]) {
  return items.map((item) =>
    item.type === "image"
      ? { type: "image" as const, imageUrl: item.imageUrl.trim(), linkUrl: item.linkUrl.trim() || undefined }
      : { type: "text" as const, text: item.text.trim() },
  );
}

export function CheckoutMessagesForm({
  initialGreetingItems,
  initialCompletionItems,
  initialPrivacyNotice,
  initialTermsText,
  initialPrivacyText,
  initialShoppingGuideText,
}: {
  initialGreetingItems: RawGreetingItem[];
  initialCompletionItems: RawGreetingItem[];
  initialPrivacyNotice: string;
  initialTermsText: string;
  initialPrivacyText: string;
  initialShoppingGuideText: string;
}) {
  const [greetingItems, setGreetingItems] = useState<GreetingItemDraft[]>(toDraft(initialGreetingItems));
  const [completionItems, setCompletionItems] = useState<GreetingItemDraft[]>(
    toDraft(initialCompletionItems),
  );
  const [privacyNotice, setPrivacyNotice] = useState(initialPrivacyNotice);
  const [termsText, setTermsText] = useState(initialTermsText);
  const [privacyText, setPrivacyText] = useState(initialPrivacyText);
  const [shoppingGuideText, setShoppingGuideText] = useState(initialShoppingGuideText);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    const res = await fetch("/api/checkout-messages", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        greetingItems: toPayload(greetingItems),
        completionItems: toPayload(completionItems),
        privacyNotice,
        termsText,
        privacyText,
        shoppingGuideText,
      }),
    });

    setSaving(false);
    setToast(
      res.ok ? { message: "保存しました", type: "success" } : { message: "保存に失敗しました", type: "error" },
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <GreetingItemsEditor
        label="あいさつ文(最大5項目・注文フォーム開始時に全商品共通で表示)"
        description="画像(+リンク)またはコメントを、表示したい順に登録してください。"
        items={greetingItems}
        onChange={setGreetingItems}
      />

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          個人情報利用に関する注意文(任意・あいさつ文の直後に表示)
        </span>
        <textarea
          className="input"
          rows={3}
          value={privacyNotice}
          onChange={(e) => setPrivacyNotice(e.target.value)}
        />
      </label>

      <GreetingItemsEditor
        label="注文確認メッセージ(最大5項目・注文確定後に全商品共通で表示)"
        description="画像(+リンク)またはコメントを、表示したい順に登録してください。"
        items={completionItems}
        onChange={setCompletionItems}
      />

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          特定商取引法に基づく表記(任意・注文確認画面のスクロールボックスに表示)
        </span>
        <textarea
          className="input font-mono"
          rows={8}
          value={termsText}
          onChange={(e) => setTermsText(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          個人情報の取り扱いについて(任意・注文確認画面のスクロールボックスに表示)
        </span>
        <textarea
          className="input font-mono"
          rows={8}
          value={privacyText}
          onChange={(e) => setPrivacyText(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">
          お買い物ガイド(任意・固定メニューの「お買い物ガイドを表示」ボタンからスレッドに表示)
        </span>
        <textarea
          className="input font-mono"
          rows={8}
          value={shoppingGuideText}
          onChange={(e) => setShoppingGuideText(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存する"}
      </button>
    </form>
  );
}
