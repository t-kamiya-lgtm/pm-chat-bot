"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/admin/Toast";

interface CampaignType {
  id: string;
  title: string;
  description: string | null;
}

/**
 * ブランドごとの継続施策タイトルの一覧・登録・削除。顧客管理画面(継続施策ログ)では
 * ここで登録したタイトルの中から選択する(自由入力による表記ゆれを防ぐため)。
 */
export function RetentionCampaignTypesPanel({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<CampaignType[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/brands/${brandId}/campaign-types`)
      .then((r) => r.json())
      .then((body) => setTypes(body.campaignTypes ?? []));
  }, [open, brandId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/brands/${brandId}/campaign-types`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `登録に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    const body = await res.json();
    setTypes((prev) => [...(prev ?? []), body.campaignType]);
    setTitle("");
    setDescription("");
  }

  async function handleDelete(typeId: string) {
    if (!window.confirm("この施策タイトルを削除します。よろしいですか?(過去のログで使われている場合は削除できません)")) return;
    const res = await fetch(`/api/brands/${brandId}/campaign-types/${typeId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    setTypes((prev) => (prev ?? []).filter((t) => t.id !== typeId));
  }

  return (
    <div className="mt-2 border-t border-neutral-100 pt-2">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-blue-600 hover:underline">
        {open ? "継続施策タイトル管理を閉じる" : "継続施策タイトルを管理"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-md bg-neutral-50 p-3">
          {types === null ? (
            <p className="text-xs text-neutral-400">読み込み中...</p>
          ) : (
            <ul className="space-y-1">
              {types.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span>
                    <span className="font-medium">{t.title}</span>
                    {t.description && <span className="ml-1 text-neutral-400">({t.description})</span>}
                  </span>
                  <button type="button" onClick={() => handleDelete(t.id)} className="text-red-600 hover:underline">
                    削除
                  </button>
                </li>
              ))}
              {types.length === 0 && <li className="text-xs text-neutral-400">登録されている施策タイトルはありません</li>}
            </ul>
          )}
          <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="施策タイトル(例: 3回目特典クーポン)"
              className="input flex-1 text-xs"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="補足(任意)"
              className="input flex-1 text-xs"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              追加
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
