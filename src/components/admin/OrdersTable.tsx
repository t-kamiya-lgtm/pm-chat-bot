"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportStatus } from "@/lib/order-filters";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe: "即時決済(Stripe)",
  deferred_invoice: "後払い(スコアあと払い)",
  cod: "代金引換",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "処理中",
  accepted: "受付済み",
  paid: "支払い完了",
  failed: "失敗",
  canceled: "キャンセル",
};

const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  imported: "取込み済み",
  on_hold: "保留",
  not_imported: "未取込み",
  import_error: "取込みエラー",
  excluded: "対象外",
};

export interface OrderRow {
  id: string;
  order_number: string | null;
  created_at: string;
  type: string;
  payment_method: string;
  amount: number;
  quantity: number;
  shipping_fee: number;
  payment_fee: number;
  status: string;
  delivery_date: string | null;
  delivery_time_slot: string | null;
  survey_responses: Record<string, string> | null;
  set_selections: { id: string; name: string }[] | null;
  import_status: ImportStatus;
  billing_cycle_number: number;
  customers: { name: string; email: string } | null;
  products: { name: string } | null;
}

function formatDeliveryDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

function formatSurveyResponses(value: Record<string, string> | null) {
  if (!value || Object.keys(value).length === 0) return null;
  return Object.entries(value)
    .map(([q, a]) => `${q}: ${a}`)
    .join("\n");
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ImportStatus>("imported");
  const [applying, setApplying] = useState(false);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  }

  async function applyBulkStatus() {
    if (selected.size === 0) return;
    setApplying(true);
    const res = await fetch("/api/orders/bulk-import-status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderIds: Array.from(selected), importStatus: bulkStatus }),
    });
    setApplying(false);
    if (res.ok) {
      setSelected(new Set());
      router.refresh();
    }
  }

  async function updateOne(id: string, importStatus: ImportStatus) {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ importStatus }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm">
          <span>{selected.size}件選択中</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as ImportStatus)}
            className="input"
          >
            {(Object.keys(IMPORT_STATUS_LABELS) as ImportStatus[]).map((key) => (
              <option key={key} value={key}>
                {IMPORT_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyBulkStatus}
            disabled={applying}
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {applying ? "適用中..." : "選択した注文に一括適用"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">
                <input
                  type="checkbox"
                  checked={orders.length > 0 && selected.size === orders.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-2">注文番号</th>
              <th className="px-4 py-2">日時</th>
              <th className="px-4 py-2">顧客</th>
              <th className="px-4 py-2">商品</th>
              <th className="px-4 py-2">数量</th>
              <th className="px-4 py-2">種別</th>
              <th className="px-4 py-2">支払い方法</th>
              <th className="px-4 py-2">金額</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2">お届け希望日時</th>
              <th className="px-4 py-2">アンケート</th>
              <th className="px-4 py-2">セット内訳</th>
              <th className="px-4 py-2">取り込み</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const surveyText = formatSurveyResponses(order.survey_responses);
              return (
                <tr key={order.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleOne(order.id)}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono whitespace-nowrap">{order.order_number ?? "-"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(order.created_at).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-4 py-2">{order.customers?.name ?? "-"}</td>
                  <td className="px-4 py-2">{order.products?.name ?? "-"}</td>
                  <td className="px-4 py-2">{order.quantity}</td>
                  <td className="px-4 py-2">
                    {order.type === "subscription" ? "定期" : "単発"}
                    {order.billing_cycle_number > 1 && (
                      <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                        {order.billing_cycle_number}回目
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{PAYMENT_METHOD_LABELS[order.payment_method]}</td>
                  <td className="px-4 py-2">
                    {(order.amount + order.shipping_fee + order.payment_fee).toLocaleString()}円
                  </td>
                  <td className="px-4 py-2">{STATUS_LABELS[order.status]}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDeliveryDate(order.delivery_date)} {order.delivery_time_slot ?? ""}
                  </td>
                  <td className="px-4 py-2">
                    {surveyText ? (
                      <span title={surveyText} className="cursor-help underline decoration-dotted">
                        {Object.keys(order.survey_responses ?? {}).length}件
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {order.set_selections && order.set_selections.length > 0 ? (
                      <span
                        title={order.set_selections.map((s) => s.name).join("\n")}
                        className="cursor-help underline decoration-dotted"
                      >
                        {order.set_selections.length}点
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={order.import_status}
                      onChange={(e) => updateOne(order.id, e.target.value as ImportStatus)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
                    >
                      {(Object.keys(IMPORT_STATUS_LABELS) as ImportStatus[]).map((key) => (
                        <option key={key} value={key}>
                          {IMPORT_STATUS_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {!orders.length && (
              <tr>
                <td colSpan={14} className="px-4 py-6 text-center text-neutral-400">
                  注文はまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
