"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import { ConfirmButton } from "@/components/admin/ConfirmButton";

export interface CouponRow {
  id: string;
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
}

function discountLabel(row: Pick<CouponRow, "discountType" | "discountValue">): string {
  return row.discountType === "percent" ? `${row.discountValue}%引き` : `${row.discountValue.toLocaleString()}円引き`;
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

export function CouponsTable({ initialCoupons }: { initialCoupons: CouponRow[] }) {
  const router = useRouter();
  const [coupons, setCoupons] = useState(initialCoupons);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

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
  }

  async function handleDelete(coupon: CouponRow) {
    setPending(coupon.id);
    await fetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
    setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
    setPending(null);
    router.refresh();
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <button
        type="button"
        onClick={() => setShowForm((prev) => !prev)}
        className="mb-4 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
      >
        {showForm ? "閉じる" : "+ 新規クーポンコードを作成"}
      </button>

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
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">コード</th>
              <th className="px-4 py-2">名称</th>
              <th className="px-4 py-2">割引</th>
              <th className="px-4 py-2">期間</th>
              <th className="px-4 py-2">使用数/上限</th>
              <th className="px-4 py-2">最低注文金額</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-mono">{c.code}</td>
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2">{discountLabel(c)}</td>
                <td className="px-4 py-2 text-xs text-neutral-500">
                  {c.startsAt ? new Date(c.startsAt).toLocaleDateString("ja-JP") : "指定なし"}
                  {" 〜 "}
                  {c.endsAt ? new Date(c.endsAt).toLocaleDateString("ja-JP") : "指定なし"}
                </td>
                <td className="px-4 py-2">
                  {c.usedCount}
                  {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
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
                      c.isActive ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {c.isActive ? "有効" : "無効"}
                  </button>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <ConfirmButton label="削除" disabled={pending === c.id} onConfirm={() => handleDelete(c)} />
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  クーポンコードがまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
