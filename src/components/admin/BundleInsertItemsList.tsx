"use client";

import { useMemo, useState } from "react";
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
  url: string | null;
  status: "active" | "inactive";
  distributedCount: number;
  brands: BrandOption | null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  brandId: string;
  itemType: string;
  name: string;
  url: string;
  registeredDate: string;
}

function emptyForm(defaultBrandId: string): FormState {
  return { brandId: defaultBrandId, itemType: "", name: "", url: "", registeredDate: todayStr() };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ja-JP");
}

/** Google DriveのURLからファイルIDを抜き出し、公開サムネイル画像のURLを組み立てる。 */
function driveThumbnailUrl(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400`;
}

const STATUS_FILTERS = [
  { key: "active", label: "アクティブ" },
  { key: "inactive", label: "無効" },
  { key: "all", label: "すべて" },
] as const;

/** ①同梱物登録: ブランドごとの個々の同梱物マスタ。②同梱物設定でセットに組み込む対象として使う。ギャラリー表示。 */
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
  const [brandFilter, setBrandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["key"]>("active");

  const filteredItems = useMemo(
    () =>
      initialItems.filter(
        (item) =>
          (brandFilter === "" || item.brand_id === brandFilter) &&
          (statusFilter === "all" || item.status === statusFilter),
      ),
    [initialItems, brandFilter, statusFilter],
  );

  function startCreate() {
    setForm(emptyForm(brands[0]?.id ?? ""));
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(item: BundleInsertItemRow) {
    setForm({ brandId: item.brand_id, itemType: item.item_type, name: item.name, url: item.url ?? "", registeredDate: item.registered_date });
    setEditingId(item.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brandId || !form.itemType.trim() || !form.name.trim() || !form.url.trim()) return;
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
        url: form.url.trim(),
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

  async function handleToggleStatus(item: BundleInsertItemRow) {
    const nextStatus = item.status === "active" ? "inactive" : "active";
    const res = await fetch(`/api/bundle-insert-items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `変更に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
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
        ブランドごとに、個々の同梱物(レシピ・挨拶文・継続応援施策の同梱物など)を登録します。URLはGoogle Driveなどの共有リンクを想定しており、プレビューから別タブで開けます。②同梱物設定でこれらを選んでセット化します。
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-xs text-neutral-500">ブランド</span>
            <select className="input" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
              <option value="">全ブランド</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.code ? `(${b.code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  statusFilter === f.key
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-neutral-300 text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
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
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">プレビューURL(Google Driveなどの共有リンク)</span>
            <input
              type="url"
              className="input"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://drive.google.com/file/d/..."
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filteredItems.map((item) => {
          const thumbnail = item.url ? driveThumbnailUrl(item.url) : null;
          return (
            <div key={item.id} className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex aspect-square items-center justify-center overflow-hidden bg-neutral-50 text-neutral-400 hover:opacity-80"
                >
                  {thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnail} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs">🔗 プレビューを開く</span>
                  )}
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center bg-neutral-50 text-xs text-neutral-300">URL未登録</div>
              )}
              <div className="flex flex-1 flex-col gap-1 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      item.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {item.status === "active" ? "アクティブ" : "無効"}
                  </span>
                  <span className="text-neutral-400">
                    {item.brands?.name ?? "-"}
                    {item.brands?.code ? `(${item.brands.code})` : ""}
                  </span>
                </div>
                <div className="text-neutral-400">{item.item_type}</div>
                <div className="font-medium text-neutral-900">{item.name}</div>
                <div className="text-neutral-400">登録日: {formatDate(item.registered_date)}</div>
                <div className="font-medium text-neutral-700">配布数: {item.distributedCount.toLocaleString()}件</div>
                <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button type="button" onClick={() => handleToggleStatus(item)} className="text-neutral-500 hover:underline">
                    {item.status === "active" ? "無効にする" : "有効にする"}
                  </button>
                  <button type="button" onClick={() => startEdit(item)} className="text-blue-600 hover:underline">
                    編集
                  </button>
                  <ConfirmButton
                    label="削除"
                    confirmLabel="この同梱物を削除します。よろしいですか?"
                    disabled={item.distributedCount > 0}
                    title={item.distributedCount > 0 ? "配布実績があるため削除できません" : undefined}
                    onConfirm={() => handleDelete(item.id)}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {filteredItems.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            条件に合致する同梱物がありません
          </p>
        )}
      </div>
    </div>
  );
}
