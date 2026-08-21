"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportStatus } from "@/lib/order-filters";
import { Toast } from "@/components/admin/Toast";

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
  shipped: "出荷済",
  canceled: "キャンセル",
};

/** 列幅はPC(横に広い画面)での閲覧を前提に、ドラッグでの調整・記憶ができるようにしている。 */
const COLUMN_KEYS = [
  "select",
  "orderNumber",
  "datetime",
  "customer",
  "product",
  "quantity",
  "type",
  "paymentMethod",
  "amount",
  "status",
  "deliveryDateTime",
  "survey",
  "setSelections",
  "importStatus",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  select: "",
  orderNumber: "注文番号",
  datetime: "日時",
  customer: "顧客",
  product: "商品",
  quantity: "数量",
  type: "種別",
  paymentMethod: "支払い方法",
  amount: "金額",
  status: "決済状況",
  deliveryDateTime: "お届け希望日時",
  survey: "アンケート",
  setSelections: "セット内訳",
  importStatus: "受注ステータス",
};

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  select: 40,
  orderNumber: 140,
  datetime: 150,
  customer: 110,
  product: 180,
  quantity: 55,
  type: 100,
  paymentMethod: 140,
  amount: 90,
  status: 140,
  deliveryDateTime: 150,
  survey: 90,
  setSelections: 90,
  importStatus: 120,
};

const MIN_COLUMN_WIDTH = 40;
const COLUMN_WIDTHS_STORAGE_KEY = "admin-orders-table-column-widths";

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
  shipped_at: string | null;
  carrier_name: string | null;
  tracking_number: string | null;
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

/** 列見出しの右端をドラッグして、その列の幅を調整するハンドル。調整結果はonResizeで都度通知する。 */
function ColumnResizeHandle({
  columnKey,
  onResize,
}: {
  columnKey: ColumnKey;
  onResize: (columnKey: ColumnKey, deltaX: number) => void;
}) {
  function handleMouseDown(event: React.MouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    let lastX = startX;

    function handleMouseMove(moveEvent: MouseEvent) {
      const deltaX = moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      onResize(columnKey, deltaX);
    }
    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-neutral-300"
    />
  );
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ImportStatus>("imported");
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);
  const saveWidthsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 前回このブラウザで調整した列幅があれば復元する(マウント後に読み込むことでSSRとの表示差分を避ける)。
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved) as Partial<Record<ColumnKey, number>>;
        setColumnWidths((prev) => ({ ...prev, ...parsed }));
      } catch {
        // 保存値が壊れている場合はデフォルト幅のまま表示する
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleColumnResize(columnKey: ColumnKey, deltaX: number) {
    setColumnWidths((prev) => {
      const next = { ...prev, [columnKey]: Math.max(MIN_COLUMN_WIDTH, prev[columnKey] + deltaX) };
      if (saveWidthsTimeoutRef.current) clearTimeout(saveWidthsTimeoutRef.current);
      saveWidthsTimeoutRef.current = setTimeout(() => {
        try {
          window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // localStorageが使えない場合は保存をあきらめる(表示自体には影響しない)
        }
      }, 300);
      return next;
    });
  }

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
      setToast({ message: "選択した注文に一括適用しました", type: "success" });
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setToast({
        message: typeof body.error === "string" ? body.error : "一括適用に失敗しました",
        type: "error",
      });
    }
  }

  async function updateOne(id: string, importStatus: ImportStatus) {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ importStatus }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setToast({ message: "取り込み状況の更新に失敗しました", type: "error" });
    }
  }

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-neutral-300 bg-sky-50 p-3 text-sm">
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

      <p className="mb-2 text-xs text-neutral-400">列見出しの右端をドラッグすると列の幅を調整できます(次回も同じ幅で表示されます)</p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="text-sm" style={{ tableLayout: "fixed", width: "max-content" }}>
          <colgroup>
            {COLUMN_KEYS.map((key) => (
              <col key={key} style={{ width: columnWidths[key] }} />
            ))}
          </colgroup>
          <thead className="bg-sky-100 text-left text-neutral-600">
            <tr>
              {COLUMN_KEYS.map((key) => (
                <th key={key} className="relative px-4 py-2 select-none">
                  {key === "select" ? (
                    <input
                      type="checkbox"
                      checked={orders.length > 0 && selected.size === orders.length}
                      onChange={toggleAll}
                    />
                  ) : (
                    COLUMN_LABELS[key]
                  )}
                  <ColumnResizeHandle columnKey={key} onResize={handleColumnResize} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const surveyText = formatSurveyResponses(order.survey_responses);
              return (
                <tr
                  key={order.id}
                  className={
                    order.import_status === "import_error"
                      ? "border-t border-neutral-100 bg-pink-50"
                      : order.import_status === "canceled"
                        ? "border-t border-neutral-100 bg-neutral-100 text-neutral-400"
                        : "border-t border-neutral-100"
                  }
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleOne(order.id)}
                    />
                  </td>
                  <td className="px-4 py-2 font-mono break-all">{order.order_number ?? "-"}</td>
                  <td className="px-4 py-2">{new Date(order.created_at).toLocaleString("ja-JP")}</td>
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
                  <td className="px-4 py-2">
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
                      className="w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
                    >
                      {(Object.keys(IMPORT_STATUS_LABELS) as ImportStatus[]).map((key) => (
                        <option key={key} value={key}>
                          {IMPORT_STATUS_LABELS[key]}
                        </option>
                      ))}
                    </select>
                    {order.import_status === "shipped" && (
                      <p
                        className="mt-1 cursor-help truncate text-xs text-neutral-400 underline decoration-dotted"
                        title={[
                          order.shipped_at && `出荷日: ${new Date(order.shipped_at).toLocaleDateString("ja-JP")}`,
                          order.carrier_name && `配送業者: ${order.carrier_name}`,
                          order.tracking_number && `送り状番号: ${order.tracking_number}`,
                        ]
                          .filter(Boolean)
                          .join("\n")}
                      >
                        送り状情報
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
            {!orders.length && (
              <tr>
                <td colSpan={COLUMN_KEYS.length} className="px-4 py-6 text-center text-neutral-400">
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
