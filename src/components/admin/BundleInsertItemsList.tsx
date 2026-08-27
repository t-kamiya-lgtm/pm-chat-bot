"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Toast } from "@/components/admin/Toast";

interface BrandOption {
  id: string;
  name: string;
  code: string | null;
}

export interface BundleInsertItemRow {
  id: string;
  brand_id: string;
  item_type: string;
  name: string;
  registered_date: string;
  brands: BrandOption | null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  brandId: string;
  itemType: string;
  name: string;
  registeredDate: string;
}

function emptyForm(defaultBrandId: string): FormState {
  return { brandId: defaultBrandId, itemType: "", name: "", registeredDate: todayStr() };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ja-JP");
}

/** ①同梱物登録: ブランドごとの個々の同梱物マスタ。②同梱物設定でセットに組み込む対象として使う。 */
export function BundleInsertItemsList({
  initialItems,
  brands,
}: {
  initialItems: BundleInsertItemRow[];
  brands: BrandOption[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(brands[0]?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function startCreate() {
    setForm(emptyForm(brands[0]?.id ?? ""));
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(item: BundleInsertItemRow) {
    setForm({ brandId: item.brand_id, itemType: item.item_type, name: item.name, registeredDate: item.registered_date });
    setEditingId(item.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brandId || !form.itemType.trim() || !form.name.trim()) return;
    setSaving(true);
    setToast(null);
    const url = editingId ? `/api/bundle-insert-items/${editingId}` : "/api/bundle-insert-items";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(!editingId && { brandId: form.brandId }),
        itemType: form.itemType.trim(),
        name: form.name.trim(),
        registeredDate: form.registeredDate,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setEditingId(null);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/bundle-insert-items/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: typeof body.error === "string" ? body.error : "削除に失敗しました", type: "error" });
    }
  }

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <p className="text-sm text-neutral-500">
        ブランドごとに、個々の同梱物(レシピ・挨拶文・継続応援施策の同梱物など)を登録します。②同梱物設定でこれらを選んでセット化します。
      </p>

      <div className="flex justify-end">
        {!showForm && (
          <button
            type="button"
            onClick={startCreate}
            disabled={brands.length === 0}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            ＋ 同梱物を登録
          </button>
        )}
      </div>

      {brands.length === 0 && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">先にブランド管理画面でブランドを登録してください。</p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">ブランド</span>
            <select
              className="input"
              value={form.brandId}
              onChange={(e) => setForm({ ...form, brandId: e.target.value })}
              disabled={Boolean(editingId)}
              required
            >
              <option value="">選択してください</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.code ? `(${b.code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">同梱物種類</span>
            <input
              className="input"
              value={form.itemType}
              onChange={(e) => setForm({ ...form, itemType: e.target.value })}
              placeholder="例: レシピブック、挨拶文、継続応援"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">同梱物名</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: レシピ01"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">登録し日</span>
            <input
              type="date"
              className="input"
              value={form.registeredDate}
              onChange={(e) => setForm({ ...form, registeredDate: e.target.value })}
              required
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
              保存する
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-sky-100 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-2">ブランド</th>
              <th className="px-4 py-2">同梱物種類</th>
              <th className="px-4 py-2">同梱物名</th>
              <th className="px-4 py-2">登録日</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {initialItems.map((item) => (
              <tr key={item.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2">
                  {item.brands?.name ?? "-"}
                  {item.brands?.code ? `(${item.brands.code})` : ""}
                </td>
                <td className="px-4 py-2">{item.item_type}</td>
                <td className="px-4 py-2 font-medium">{item.name}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(item.registered_date)}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-3 text-xs">
                    <button type="button" onClick={() => startEdit(item)} className="text-blue-600 hover:underline">
                      編集
                    </button>
                    <ConfirmButton label="削除" confirmLabel="この同梱物を削除します。よろしいですか?" onConfirm={() => handleDelete(item.id)} />
                  </div>
                </td>
              </tr>
            ))}
            {initialItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  同梱物が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
