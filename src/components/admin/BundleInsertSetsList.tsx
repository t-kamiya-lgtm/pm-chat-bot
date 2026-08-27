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

interface ProductOption {
  id: string;
  name: string;
  smaregi_product_id: string | null;
}

export interface BundleInsertItemOption {
  id: string;
  brand_id: string;
  name: string;
  item_type: string;
}

export interface BundleInsertSetRow {
  id: string;
  brand_id: string;
  name: string;
  insert_label: string | null;
  period_start: string;
  period_end: string | null;
  target_order_type: "subscription" | "one_time" | "both";
  target_cycle_numbers: number[] | null;
  target_product_ids: string[] | null;
  item_ids: string[] | null;
  description: string | null;
  status: "active" | "draft";
  distributedCount: number;
  brands: BrandOption | null;
  items: { id: string; name: string; item_type: string }[];
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  subscription: "定期のみ",
  one_time: "単品のみ",
  both: "定期・単品どちらも",
};

interface FormState {
  brandId: string;
  name: string;
  insertLabel: string;
  periodStart: string;
  periodEnd: string;
  targetOrderType: "subscription" | "one_time" | "both";
  targetCycleNumbers: string;
  targetProductIds: string[];
  itemIds: string[];
  description: string;
}

function emptyForm(defaultBrandId: string): FormState {
  return {
    brandId: defaultBrandId,
    name: "",
    insertLabel: "",
    periodStart: "",
    periodEnd: "",
    targetOrderType: "both",
    targetCycleNumbers: "",
    targetProductIds: [],
    itemIds: [],
    description: "",
  };
}

function toPayload(form: FormState, status: "active" | "draft") {
  const cycles = form.targetCycleNumbers
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return {
    brandId: form.brandId,
    name: form.name.trim(),
    insertLabel: form.insertLabel.trim() || undefined,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd || null,
    targetOrderType: form.targetOrderType,
    targetCycleNumbers: cycles.length > 0 ? cycles : null,
    targetProductIds: form.targetProductIds.length > 0 ? form.targetProductIds : null,
    itemIds: form.itemIds.length > 0 ? form.itemIds : null,
    description: form.description.trim() || undefined,
    status,
  };
}

function formatDate(value: string | null) {
  if (!value) return "〜(継続中)";
  return new Date(value).toLocaleDateString("ja-JP");
}

interface ConflictInfo {
  message: string;
  conflicts: { id: string; name: string }[];
  onSaveAsDraft: (() => Promise<void>) | null;
}

export function BundleInsertSetsList({
  initialSets,
  brands,
  products,
  items,
}: {
  initialSets: BundleInsertSetRow[];
  brands: BrandOption[];
  products: ProductOption[];
  items: BundleInsertItemOption[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(brands[0]?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const itemsForBrand = items.filter((i) => i.brand_id === form.brandId);

  function startCreate() {
    setForm(emptyForm(brands[0]?.id ?? ""));
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(set: BundleInsertSetRow) {
    setForm({
      brandId: set.brand_id,
      name: set.name,
      insertLabel: set.insert_label ?? "",
      periodStart: set.period_start,
      periodEnd: set.period_end ?? "",
      targetOrderType: set.target_order_type,
      targetCycleNumbers: (set.target_cycle_numbers ?? []).join(", "),
      targetProductIds: set.target_product_ids ?? [],
      itemIds: set.item_ids ?? [],
      description: set.description ?? "",
    });
    setEditingId(set.id);
    setShowForm(true);
  }

  async function submit(status: "active" | "draft") {
    setSaving(true);
    setToast(null);
    const url = editingId ? `/api/bundle-insert-sets/${editingId}` : "/api/bundle-insert-sets";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toPayload(form, status)),
    });
    setSaving(false);
    if (res.ok) {
      setConflict(null);
      setShowForm(false);
      setEditingId(null);
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && Array.isArray(body.conflicts)) {
      setConflict({
        message: `以下の同梱物設定と対象条件(期間・対象種別・対象回数・対象商品)が重複しています。\n「${body.conflicts.map((c: { name: string }) => c.name).join("」「")}」`,
        conflicts: body.conflicts,
        onSaveAsDraft: () => submit("draft"),
      });
      return;
    }
    setToast({ message: `保存に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brandId || !form.name.trim() || !form.periodStart) return;
    await submit("active");
  }

  async function handleActivate(set: BundleInsertSetRow) {
    setToast(null);
    const res = await fetch(`/api/bundle-insert-sets/${set.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    if (res.ok) {
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && Array.isArray(body.conflicts)) {
      setConflict({
        message: `アクティブにできません。以下の同梱物設定と対象条件が重複しています。\n「${body.conflicts.map((c: { name: string }) => c.name).join("」「")}」\n条件を見直してから再度お試しください。`,
        conflicts: body.conflicts,
        onSaveAsDraft: null,
      });
      return;
    }
    setToast({ message: `変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/bundle-insert-sets/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
    }
  }

  function toggleProduct(productId: string) {
    setForm((f) => ({
      ...f,
      targetProductIds: f.targetProductIds.includes(productId)
        ? f.targetProductIds.filter((id) => id !== productId)
        : [...f.targetProductIds, productId],
    }));
  }

  function toggleItem(itemId: string) {
    setForm((f) => ({
      ...f,
      itemIds: f.itemIds.includes(itemId) ? f.itemIds.filter((id) => id !== itemId) : [...f.itemIds, itemId],
    }));
  }

  return (
    <div className="space-y-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {conflict && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="whitespace-pre-line">{conflict.message}</p>
          <div className="flex flex-wrap gap-2">
            {conflict.onSaveAsDraft && (
              <button
                type="button"
                disabled={saving}
                onClick={() => conflict.onSaveAsDraft?.()}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                下書きとして保存する
              </button>
            )}
            <button
              type="button"
              onClick={() => setConflict(null)}
              className="rounded-md border border-amber-400 px-3 py-1.5 text-xs hover:bg-amber-100"
            >
              {conflict.onSaveAsDraft ? "条件を修正する" : "閉じる"}
            </button>
          </div>
        </div>
      )}

      <p className="text-sm text-neutral-500">
        ①同梱物登録で登録した同梱物を選んで、セットとして条件(期間・対象商品・対象回数)を設定します。既存のアクティブな設定と条件が重複する場合は、確認の上で下書き保存できます。
      </p>

      <div className="flex justify-end">
        {!showForm && (
          <button
            type="button"
            onClick={startCreate}
            disabled={brands.length === 0}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            ＋ 同梱物セットを登録
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
              onChange={(e) => setForm({ ...form, brandId: e.target.value, itemIds: [] })}
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
            <span className="mb-1 block text-xs text-neutral-500">セット管理名</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 定期初回セット01" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">同梱物ラベル(任意・表示用)</span>
            <input className="input" value={form.insertLabel} onChange={(e) => setForm({ ...form, insertLabel: e.target.value })} placeholder="例: ABCセット" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">対象種別</span>
            <select
              className="input"
              value={form.targetOrderType}
              onChange={(e) => setForm({ ...form, targetOrderType: e.target.value as FormState["targetOrderType"] })}
            >
              {Object.entries(ORDER_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">適用期間(開始)</span>
            <input type="date" className="input" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">適用期間(終了・未定なら空欄)</span>
            <input type="date" className="input" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">
              対象回数(定期のみ有効、カンマ区切り。空欄は全回数対象)
            </span>
            <input
              className="input"
              value={form.targetCycleNumbers}
              onChange={(e) => setForm({ ...form, targetCycleNumbers: e.target.value })}
              placeholder="例: 1, 2, 3"
            />
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">対象商品(空欄は全商品対象)</span>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-neutral-200 p-2">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.targetProductIds.includes(p.id)} onChange={() => toggleProduct(p.id)} />
                  {p.smaregi_product_id ?? p.id.slice(0, 8)} - {p.name}
                </label>
              ))}
              {products.length === 0 && <p className="text-xs text-neutral-400">商品が登録されていません</p>}
            </div>
          </div>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">セットに含める同梱物(①同梱物登録から選択)</span>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-neutral-200 p-2">
              {itemsForBrand.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={form.itemIds.includes(item.id)} onChange={() => toggleItem(item.id)} />
                  <span className="text-neutral-400">[{item.item_type}]</span> {item.name}
                </label>
              ))}
              {itemsForBrand.length === 0 && (
                <p className="text-xs text-neutral-400">このブランドの同梱物が①同梱物登録で登録されていません</p>
              )}
            </div>
          </div>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">補足(任意)</span>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
                setConflict(null);
              }}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {initialSets.map((set) => (
          <div key={set.id} className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      set.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {set.status === "active" ? "アクティブ" : "下書き"}
                  </span>
                  <span className="font-semibold">{set.name}</span>
                  {set.insert_label && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{set.insert_label}</span>}
                  <span className="text-xs text-neutral-400">
                    {set.brands?.name ?? "-"}
                    {set.brands?.code ? `(${set.brands.code})` : ""}
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {formatDate(set.period_start)} 〜 {formatDate(set.period_end)} / {ORDER_TYPE_LABELS[set.target_order_type]}
                  {set.target_cycle_numbers && set.target_cycle_numbers.length > 0 && <> / 対象回数: {set.target_cycle_numbers.join(", ")}回目</>}
                  {set.target_product_ids && set.target_product_ids.length > 0 && <> / 対象商品{set.target_product_ids.length}件</>}
                </div>
                {set.items.length > 0 && (
                  <div className="mt-1 text-xs text-neutral-500">
                    同梱物: {set.items.map((i) => i.name).join("、")}
                  </div>
                )}
                <div className="mt-1 text-xs font-medium text-neutral-700">累計配布件数: {set.distributedCount.toLocaleString()}件</div>
                {set.description && <div className="mt-1 text-xs text-neutral-400">{set.description}</div>}
              </div>
              <div className="flex shrink-0 gap-3 text-sm">
                {set.status === "draft" && (
                  <button type="button" onClick={() => handleActivate(set)} className="text-emerald-600 hover:underline">
                    アクティブにする
                  </button>
                )}
                <button type="button" onClick={() => startEdit(set)} className="text-blue-600 hover:underline">
                  編集
                </button>
                <ConfirmButton label="削除" confirmLabel="この同梱物セットを削除します。よろしいですか?" onConfirm={() => handleDelete(set.id)} />
              </div>
            </div>
          </div>
        ))}
        {initialSets.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">同梱物セットが登録されていません</p>
        )}
      </div>
    </div>
  );
}
