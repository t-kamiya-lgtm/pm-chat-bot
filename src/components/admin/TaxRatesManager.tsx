"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Toast } from "@/components/admin/Toast";

export interface TaxRateRow {
  id: string;
  name: string;
  rate: number;
}

interface ProductGroupOption {
  id: string;
  name: string;
}

interface AssignmentRow {
  id: string;
  tax_rate_id: string;
  period_start: string;
  period_end: string | null;
  tax_rates: TaxRateRow | null;
}

function formatDate(value: string | null) {
  if (!value) return "〜(継続中)";
  return new Date(value).toLocaleDateString("ja-JP");
}

function formatRate(rate: number) {
  return `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 2)}%`;
}

/**
 * 税率メニュー(標準税率10%等)の管理と、商品ジャンル(アイテム)ごとの税率適用期間の設定。
 * 商品ごとに税率・期間を設定するより手間を減らすため、ジャンル単位×期間で管理する。
 */
export function TaxRatesManager({
  initialTaxRates,
  productGroups,
}: {
  initialTaxRates: TaxRateRow[];
  productGroups: ProductGroupOption[];
}) {
  const router = useRouter();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [rateName, setRateName] = useState("");
  const [ratePercent, setRatePercent] = useState<number>(10);
  const [savingRate, setSavingRate] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState(productGroups[0]?.id ?? "");
  const [assignments, setAssignments] = useState<AssignmentRow[] | null>(null);
  const [assignTaxRateId, setAssignTaxRateId] = useState(initialTaxRates[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);

  useEffect(() => {
    if (!selectedGroupId) return;
    fetch(`/api/product-groups/${selectedGroupId}/tax-rates`)
      .then((r) => r.json())
      .then((body) => setAssignments(body.assignments ?? []));
  }, [selectedGroupId]);

  async function handleAddRate(e: React.FormEvent) {
    e.preventDefault();
    if (!rateName.trim()) return;
    setSavingRate(true);
    const res = await fetch("/api/tax-rates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: rateName.trim(), ratePercent }),
    });
    setSavingRate(false);
    if (res.ok) {
      setRateName("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `登録に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
    }
  }

  async function handleDeleteRate(id: string) {
    const res = await fetch(`/api/tax-rates/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: typeof body.error === "string" ? body.error : "削除に失敗しました", type: "error" });
    }
  }

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId || !assignTaxRateId || !periodStart) return;
    setSavingAssignment(true);
    const res = await fetch(`/api/product-groups/${selectedGroupId}/tax-rates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taxRateId: assignTaxRateId, periodStart, periodEnd: periodEnd || null }),
    });
    setSavingAssignment(false);
    if (res.ok) {
      setPeriodStart("");
      setPeriodEnd("");
      const refreshed = await fetch(`/api/product-groups/${selectedGroupId}/tax-rates`).then((r) => r.json());
      setAssignments(refreshed.assignments ?? []);
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `登録に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
    }
  }

  async function handleDeleteAssignment(assignmentId: string) {
    if (!selectedGroupId) return;
    const res = await fetch(`/api/product-groups/${selectedGroupId}/tax-rates/${assignmentId}`, { method: "DELETE" });
    if (res.ok) {
      setAssignments((prev) => (prev ?? []).filter((a) => a.id !== assignmentId));
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({ message: `削除に失敗しました: ${JSON.stringify(body.error ?? res.status)}`, type: "error" });
    }
  }

  return (
    <div className="space-y-8">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">税率メニュー</h2>
        <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {initialTaxRates.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 text-sm">
              <span>
                {t.name} <span className="ml-1 text-neutral-400">({formatRate(t.rate)})</span>
              </span>
              <ConfirmButton label="削除" confirmLabel="この税率を削除します。よろしいですか?" onConfirm={() => handleDeleteRate(t.id)} />
            </div>
          ))}
          {initialTaxRates.length === 0 && <p className="p-4 text-sm text-neutral-400">税率が登録されていません</p>}
        </div>
        <form onSubmit={handleAddRate} className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">税率名</span>
            <input className="input" value={rateName} onChange={(e) => setRateName(e.target.value)} placeholder="例: 標準税率" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">税率(%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="input w-28"
              value={ratePercent}
              onChange={(e) => setRatePercent(Number(e.target.value))}
            />
          </label>
          <button type="submit" disabled={savingRate} className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
            追加
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">商品ジャンル別 税率適用期間</h2>
        <p className="text-sm text-neutral-500">
          アイテム(親品番)単位で、税率メニューと適用期間を設定します。同じジャンルでも期間により異なる税率を設定できます。
        </p>
        <label className="block max-w-sm">
          <span className="mb-1 block text-xs text-neutral-500">アイテム</span>
          <select
            className="input"
            value={selectedGroupId}
            onChange={(e) => {
              setSelectedGroupId(e.target.value);
              setAssignments(null);
            }}
          >
            <option value="">選択してください</option>
            {productGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        {selectedGroupId && (
          <>
            <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
              {assignments === null && <p className="p-4 text-sm text-neutral-400">読み込み中...</p>}
              {assignments?.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    {formatDate(a.period_start)} 〜 {formatDate(a.period_end)}:{" "}
                    <span className="font-medium">{a.tax_rates?.name ?? "(削除済み)"}</span>
                    {a.tax_rates && <span className="ml-1 text-neutral-400">({formatRate(a.tax_rates.rate)})</span>}
                  </span>
                  <ConfirmButton
                    label="削除"
                    confirmLabel="この期間設定を削除します。よろしいですか?"
                    onConfirm={() => handleDeleteAssignment(a.id)}
                  />
                </div>
              ))}
              {assignments && assignments.length === 0 && (
                <p className="p-4 text-sm text-neutral-400">期間設定がありません</p>
              )}
            </div>
            <form onSubmit={handleAddAssignment} className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">税率</span>
                <select className="input" value={assignTaxRateId} onChange={(e) => setAssignTaxRateId(e.target.value)}>
                  <option value="">選択してください</option>
                  {initialTaxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}({formatRate(t.rate)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">開始日</span>
                <input type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">終了日(未定なら空欄)</span>
                <input type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </label>
              <button type="submit" disabled={savingAssignment} className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">
                追加
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
