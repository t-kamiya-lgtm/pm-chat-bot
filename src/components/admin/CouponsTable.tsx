"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

export interface CouponRow {
  id: string;
  type: "scenario_auto" | "manual_code";
  code: string | null;
  name: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  usedCount: number;
  minOrderAmount: number | null;
  isActive: boolean;
  scenarioId: string | null;
  scenarioName: string | null;
  createdAt: string;
}

function discountLabel(row: Pick<CouponRow, "discountType" | "discountValue">): string {
  return row.discountType === "percent" ? `${row.discountValue}%引き` : `${row.discountValue.toLocaleString()}円引き`;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("ja-JP") : "指定なし";
}

function isExpired(row: CouponRow): boolean {
  return Boolean(row.endsAt && new Date(row.endsAt) < new Date());
}

const emptyForm = {
  code: "",
  name: "",
  discountType: "percent" as "percent" | "fixed",
  discountValue: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  minOrderAmount: "",
};

function toEditForm(row: CouponRow) {
  return {
    code: row.code ?? "",
    name: row.name,
    discountType: row.discountType,
    discountValue: String(row.discountValue),
    startsAt: row.startsAt ? row.startsAt.slice(0, 10) : "",
    endsAt: row.endsAt ? row.endsAt.slice(0, 10) : "",
    maxUses: row.maxUses ? String(row.maxUses) : "",
    minOrderAmount: row.minOrderAmount ? String(row.minOrderAmount) : "",
  };
}

export function CouponsTable({
  initialCoupons,
  scenarios,
}: {
  initialCoupons: CouponRow[];
  scenarios: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [coupons, setCoupons] = useState(initialCoupons);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [scenarioFilter, setScenarioFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [expandedUsageId, setExpandedUsageId] = useState<string | null>(null);
  const [usageByMonth, setUsageByMonth] = useState<Record<string, { month: string; count: number }[]>>({});
  const [usageLoading, setUsageLoading] = useState<string | null>(null);

  const filtered = scenarioFilter ? coupons.filter((c) => c.scenarioId === scenarioFilter) : coupons;
  const activeRows = filtered.filter((c) => !isExpired(c));
  const expiredRows = filtered.filter((c) => isExpired(c));
  const sortedRows = [...activeRows, ...expiredRows];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.discountValue) {
      setToast({ message: "コード・名称・割引額を入力してください", type: "error" });
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "manual_code",
        code: form.code.trim(),
        name: form.name.trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `作成に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    const { coupon } = await res.json();
    setCoupons((prev) => [
      {
        id: coupon.id,
        type: "manual_code",
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        startsAt: coupon.starts_at,
        endsAt: coupon.ends_at,
        maxUses: coupon.max_uses,
        usedCount: coupon.used_count,
        minOrderAmount: coupon.min_order_amount,
        isActive: coupon.is_active,
        scenarioId: null,
        scenarioName: null,
        createdAt: coupon.created_at,
      },
      ...prev,
    ]);
    setForm(emptyForm);
    setShowForm(false);
    setToast({ message: "クーポンコードを作成しました", type: "success" });
    router.refresh();
  }

  async function toggleActive(coupon: CouponRow) {
    setPending(coupon.id);
    const res = await fetch(`/api/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
    setPending(null);
    if (!res.ok) {
      setToast({ message: "更新に失敗しました", type: "error" });
      return;
    }
    setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c)));
    if (editingId === coupon.id) setEditingId(null);
  }

  async function handleDelete(coupon: CouponRow) {
    setPending(coupon.id);
    const res = await fetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
    setPending(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: typeof body.error === "string" ? body.error : "削除に失敗しました",
        type: "error",
      });
      return;
    }
    setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
    router.refresh();
  }

  async function handleDuplicate(coupon: CouponRow) {
    setPending(coupon.id);
    const res = await fetch(`/api/coupons/${coupon.id}/duplicate`, { method: "POST" });
    setPending(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `複製に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    const { coupon: created } = await res.json();
    setCoupons((prev) => [
      {
        id: created.id,
        type: "manual_code",
        code: created.code,
        name: created.name,
        discountType: created.discount_type,
        discountValue: created.discount_value,
        startsAt: created.starts_at,
        endsAt: created.ends_at,
        maxUses: created.max_uses,
        usedCount: created.used_count,
        minOrderAmount: created.min_order_amount,
        isActive: created.is_active,
        scenarioId: null,
        scenarioName: null,
        createdAt: created.created_at,
      },
      ...prev,
    ]);
    setToast({ message: `「${coupon.name}」を複製しました。コードを編集してください`, type: "success" });
    router.refresh();
  }

  function startEdit(coupon: CouponRow) {
    if (coupon.type !== "manual_code") return;
    setEditingId(coupon.id);
    setEditForm(toEditForm(coupon));
  }

  async function handleSaveEdit(coupon: CouponRow) {
    if (!editForm.code.trim() || !editForm.name.trim() || !editForm.discountValue) {
      setToast({ message: "コード・名称・割引額を入力してください", type: "error" });
      return;
    }
    setPending(coupon.id);
    const res = await fetch(`/api/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: editForm.code.trim(),
        name: editForm.name.trim(),
        discountType: editForm.discountType,
        discountValue: Number(editForm.discountValue),
        startsAt: editForm.startsAt ? new Date(editForm.startsAt).toISOString() : null,
        endsAt: editForm.endsAt ? new Date(editForm.endsAt).toISOString() : null,
        maxUses: editForm.maxUses ? Number(editForm.maxUses) : null,
        minOrderAmount: editForm.minOrderAmount ? Number(editForm.minOrderAmount) : null,
      }),
    });
    setPending(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `更新に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
      return;
    }
    const { coupon: updated } = await res.json();
    setCoupons((prev) =>
      prev.map((c) =>
        c.id === coupon.id
          ? {
              ...c,
              code: updated.code,
              name: updated.name,
              discountType: updated.discount_type,
              discountValue: updated.discount_value,
              startsAt: updated.starts_at,
              endsAt: updated.ends_at,
              maxUses: updated.max_uses,
              minOrderAmount: updated.min_order_amount,
            }
          : c,
      ),
    );
    setEditingId(null);
    setToast({ message: "クーポンを更新しました", type: "success" });
    router.refresh();
  }

  async function toggleUsage(coupon: CouponRow) {
    if (expandedUsageId === coupon.id) {
      setExpandedUsageId(null);
      return;
    }
    setExpandedUsageId(coupon.id);
    if (usageByMonth[coupon.id]) return;
    setUsageLoading(coupon.id);
    const res = await fetch(`/api/coupons/${coupon.id}/usage-by-month`);
    setUsageLoading(null);
    if (!res.ok) return;
    const body = await res.json();
    setUsageByMonth((prev) => ({ ...prev, [coupon.id]: body.months ?? [] }));
  }

  const columnCount = 10;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowForm((prev) => !prev)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          {showForm ? "閉じる" : "+ 新規クーポンコードを作成"}
        </button>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          対象シナリオで絞り込み
          <select
            value={scenarioFilter}
            onChange={(e) => setScenarioFilter(e.target.value)}
            className="input"
          >
            <option value="">すべて</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm"
        >
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">コード(半角英数字)</span>
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="例: INFLUENCER_A"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">名称(管理用)</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="例: インフルエンサーA様"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">割引種別</span>
            <select
              className="input"
              value={form.discountType}
              onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value as "percent" | "fixed" }))}
            >
              <option value="percent">%引き</option>
              <option value="fixed">定額引き</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">
              割引額({form.discountType === "percent" ? "%" : "円"})
            </span>
            <input
              type="number"
              min={1}
              className="input"
              value={form.discountValue}
              onChange={(e) => setForm((p) => ({ ...p, discountValue: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">開始日(任意)</span>
            <input
              type="date"
              className="input"
              value={form.startsAt}
              onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">終了日(任意)</span>
            <input
              type="date"
              className="input"
              value={form.endsAt}
              onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">上限枚数(任意)</span>
            <input
              type="number"
              min={1}
              className="input"
              value={form.maxUses}
              onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">最低注文金額(任意・円)</span>
            <input
              type="number"
              min={0}
              className="input"
              value={form.minOrderAmount}
              onChange={(e) => setForm((p) => ({ ...p, minOrderAmount: e.target.value }))}
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "作成中..." : "作成"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">種別</th>
              <th className="px-4 py-2">コード / 対象シナリオ</th>
              <th className="px-4 py-2">名称</th>
              <th className="px-4 py-2">割引</th>
              <th className="px-4 py-2">開始日</th>
              <th className="px-4 py-2">終了日</th>
              <th className="px-4 py-2">累計使用数/上限</th>
              <th className="px-4 py-2">最低注文金額</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((c) => {
              const expired = isExpired(c);
              return (
                <Fragment key={c.id}>
                  <tr className={`border-t border-neutral-100 ${expired ? "bg-neutral-100 text-neutral-400" : ""}`}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {c.type === "scenario_auto" ? "自動適用" : "コード"}
                    </td>
                    <td className="px-4 py-2 font-mono">
                      {c.type === "manual_code" ? (
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="underline decoration-dotted hover:text-blue-600"
                        >
                          {c.code}
                        </button>
                      ) : c.scenarioId ? (
                        <Link href={`/admin/scenarios/${c.scenarioId}`} className="text-blue-600 hover:underline">
                          {c.scenarioName ?? "シナリオを開く"}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {c.type === "manual_code" ? (
                        <button type="button" onClick={() => startEdit(c)} className="underline decoration-dotted hover:text-blue-600">
                          {c.name}
                        </button>
                      ) : (
                        c.name
                      )}
                    </td>
                    <td className="px-4 py-2">{discountLabel(c)}</td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">{formatDate(c.startsAt)}</td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap">{formatDate(c.endsAt)}</td>
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => toggleUsage(c)} className="underline decoration-dotted hover:text-blue-600">
                        {c.usedCount}
                        {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      {c.minOrderAmount !== null ? `${c.minOrderAmount.toLocaleString()}円以上` : "-"}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        disabled={pending === c.id}
                        onClick={() => toggleActive(c)}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.isActive ? "bg-green-100 text-green-700" : "bg-neutral-200 text-neutral-500"
                        }`}
                      >
                        {c.isActive ? "有効" : "停止中"}
                      </button>
                      {expired && <span className="ml-1 text-xs text-neutral-400">(期間終了)</span>}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {c.type === "manual_code" && (
                        <button
                          type="button"
                          disabled={pending === c.id}
                          onClick={() => handleDuplicate(c)}
                          className="mr-3 text-xs text-blue-600 hover:underline disabled:opacity-30"
                        >
                          複製
                        </button>
                      )}
                      <ConfirmButton
                        label="削除"
                        disabled={pending === c.id || c.usedCount > 0}
                        title={c.usedCount > 0 ? "使用実績のあるクーポンは削除できません" : undefined}
                        onConfirm={() => handleDelete(c)}
                      />
                    </td>
                  </tr>
                  {expandedUsageId === c.id && (
                    <tr className="border-t border-neutral-100 bg-neutral-50">
                      <td colSpan={columnCount} className="px-4 py-3 text-xs">
                        {usageLoading === c.id ? (
                          "読み込み中..."
                        ) : (usageByMonth[c.id]?.length ?? 0) === 0 ? (
                          "使用実績はまだありません"
                        ) : (
                          <div className="flex flex-wrap gap-4">
                            {usageByMonth[c.id]!.map((m) => (
                              <span key={m.month}>
                                {m.month}: <span className="font-medium">{m.count}回</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {editingId === c.id && (
                    <tr className="border-t border-neutral-100 bg-blue-50">
                      <td colSpan={columnCount} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-3 text-sm">
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">コード</span>
                            <input
                              className="input"
                              value={editForm.code}
                              onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">名称</span>
                            <input
                              className="input"
                              value={editForm.name}
                              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">割引種別</span>
                            <select
                              className="input"
                              value={editForm.discountType}
                              onChange={(e) =>
                                setEditForm((p) => ({ ...p, discountType: e.target.value as "percent" | "fixed" }))
                              }
                            >
                              <option value="percent">%引き</option>
                              <option value="fixed">定額引き</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">
                              割引額({editForm.discountType === "percent" ? "%" : "円"})
                            </span>
                            <input
                              type="number"
                              min={1}
                              className="input"
                              value={editForm.discountValue}
                              onChange={(e) => setEditForm((p) => ({ ...p, discountValue: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">開始日</span>
                            <input
                              type="date"
                              className="input"
                              value={editForm.startsAt}
                              onChange={(e) => setEditForm((p) => ({ ...p, startsAt: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">終了日</span>
                            <input
                              type="date"
                              className="input"
                              value={editForm.endsAt}
                              onChange={(e) => setEditForm((p) => ({ ...p, endsAt: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">上限枚数</span>
                            <input
                              type="number"
                              min={1}
                              className="input"
                              value={editForm.maxUses}
                              onChange={(e) => setEditForm((p) => ({ ...p, maxUses: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-500">最低注文金額</span>
                            <input
                              type="number"
                              min={0}
                              className="input"
                              value={editForm.minOrderAmount}
                              onChange={(e) => setEditForm((p) => ({ ...p, minOrderAmount: e.target.value }))}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={pending === c.id}
                            onClick={() => handleSaveEdit(c)}
                            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
                          >
                            キャンセル
                          </button>
                          {c.isActive && (
                            <button
                              type="button"
                              disabled={pending === c.id}
                              onClick={() => toggleActive(c)}
                              className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              今すぐ停止する
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-4 py-6 text-center text-neutral-400">
                  クーポンがまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
