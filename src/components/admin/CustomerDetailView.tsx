"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import type { Address, SubscriptionInterval } from "@/lib/types";
import type { CustomerDetailOrder } from "@/lib/customer-detail";

const INTERVAL_LABELS: Record<SubscriptionInterval, string> = {
  biweekly: "2週間ごと",
  monthly: "1ヶ月ごと",
  bimonthly: "2ヶ月ごと",
};

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

/** 決済が完了し、購入として確定した状態(admin/dashboardの集計と同じ基準)。 */
const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ja-JP");
}

/** アドオン加算・値引反映後の請求額(スマレジ連携・CSV出力と同じ計算式)。 */
function orderTotal(o: CustomerDetailOrder): number {
  return (
    o.amount +
    (o.addon_amount ?? 0) +
    o.shipping_fee +
    o.payment_fee -
    (o.discount_amount ?? 0) -
    (o.first_time_discount_amount ?? 0)
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

function AddressText({ address }: { address: Address | null }) {
  if (!address) return <span>-</span>;
  if (!address.postalCode && !address.city) {
    return <span>{address.prefecture || "-"}(詳細は非表示)</span>;
  }
  return (
    <span>
      〒{address.postalCode} {address.prefecture}
      {address.city}
      {address.line1}
      {address.line2 ?? ""}
    </span>
  );
}

export function CustomerDetailView({
  customer,
  orders,
  isAdmin,
}: {
  customer: {
    id: string;
    customerNumber: number | null;
    name: string;
    email: string;
    phone: string | null;
    address: Address | null;
    createdAt: string;
    isMasked: boolean;
  };
  orders: CustomerDetailOrder[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const activeSubscription = orders.find(
    (o) =>
      o.type === "subscription" &&
      !o.parent_order_id &&
      o.subscriptions?.[0]?.status === "active",
  );

  const [expandedSurvey, setExpandedSurvey] = useState<string | null>(null);

  const confirmedOrders = orders.filter((o) => CONFIRMED_ORDER_STATUSES.includes(o.status));
  const totalPurchaseCount = confirmedOrders.length;
  const totalPurchaseAmount = confirmedOrders.reduce((sum, o) => sum + orderTotal(o), 0);
  // ordersはcreated_at降順で渡されるため、先頭が最新の注文
  const latestOrder = orders[0] ?? null;
  const latestShippingAddress = latestOrder?.shipping_address ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {customer.name} 様{" "}
          <span className="text-base font-normal text-neutral-400">(顧客ID: {customer.customerNumber})</span>
        </h1>
        <div className="flex gap-4 text-sm text-neutral-600">
          <span>
            累計購入回数: <strong className="text-neutral-900">{totalPurchaseCount}</strong>回
          </span>
          <span>
            累計購入金額: <strong className="text-neutral-900">{totalPurchaseAmount.toLocaleString()}</strong>円
          </span>
        </div>
      </div>

      {customer.isMasked && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          電話番号・メールアドレス・詳細な住所はマスク表示されています(admin権限のみフル表示できます)。
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-neutral-700 sm:col-span-2">注文者情報</h2>
        <div>
          <span className="block text-xs text-neutral-500">メールアドレス</span>
          {customer.email}
        </div>
        <div>
          <span className="block text-xs text-neutral-500">電話番号</span>
          {customer.phone ?? "-"}
        </div>
        <div className="sm:col-span-2">
          <span className="block text-xs text-neutral-500">住所</span>
          <AddressText address={customer.address} />
        </div>
        <div>
          <span className="block text-xs text-neutral-500">登録日</span>
          {formatDate(customer.createdAt)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-neutral-700 sm:col-span-2">
          お届け先情報
          {latestOrder && (
            <span className="ml-2 text-xs font-normal text-neutral-400">
              (最新のご注文: {latestOrder.order_number ?? "-"})
            </span>
          )}
        </h2>
        {latestShippingAddress ? (
          <>
            <div>
              <span className="block text-xs text-neutral-500">お届け先氏名</span>
              {latestShippingAddress.recipientName}
            </div>
            <div>
              <span className="block text-xs text-neutral-500">お届け先電話番号</span>
              {latestShippingAddress.recipientPhone}
            </div>
            <div className="sm:col-span-2">
              <span className="block text-xs text-neutral-500">お届け先住所</span>
              <AddressText address={latestShippingAddress} />
            </div>
          </>
        ) : (
          <p className="text-neutral-500 sm:col-span-2">注文者情報の住所と同じです</p>
        )}
      </div>

      {isAdmin && activeSubscription && (
        <SubscriptionEditPanel order={activeSubscription} onSaved={() => router.refresh()} />
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">購入履歴</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-sky-100 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-2">注文番号</th>
                <th className="px-4 py-2">日時</th>
                <th className="px-4 py-2">商品</th>
                <th className="px-4 py-2">数量</th>
                <th className="px-4 py-2">種別</th>
                <th className="px-4 py-2">支払方法</th>
                <th className="px-4 py-2">金額</th>
                <th className="px-4 py-2">決済状況</th>
                <th className="px-4 py-2">アンケート</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-mono whitespace-nowrap">
                    {o.order_number ?? "-"}
                    {o.billing_cycle_number > 1 && (
                      <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                        {o.billing_cycle_number}回目
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(o.created_at)}</td>
                  <td className="px-4 py-2">{o.products?.name ?? "-"}</td>
                  <td className="px-4 py-2">{o.quantity}</td>
                  <td className="px-4 py-2">{o.type === "subscription" ? "定期" : "単発"}</td>
                  <td className="px-4 py-2">{PAYMENT_METHOD_LABELS[o.payment_method]}</td>
                  <td className="px-4 py-2">{orderTotal(o).toLocaleString()}円</td>
                  <td className="px-4 py-2">{STATUS_LABELS[o.status]}</td>
                  <td className="px-4 py-2">
                    {o.survey_responses && Object.keys(o.survey_responses).length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setExpandedSurvey(expandedSurvey === o.id ? null : o.id)}
                        className="text-blue-600 hover:underline"
                      >
                        {expandedSurvey === o.id ? "閉じる" : "見る"}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                    購入履歴がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {expandedSurvey &&
          (() => {
            const order = orders.find((o) => o.id === expandedSurvey);
            if (!order?.survey_responses) return null;
            return (
              <div className="mt-2 rounded-md border border-neutral-200 bg-sky-50 p-3 text-sm">
                {Object.entries(order.survey_responses).map(([q, a]) => (
                  <p key={q}>
                    <span className="text-neutral-500">{q}: </span>
                    {a}
                  </p>
                ))}
              </div>
            );
          })()}
      </div>
    </div>
  );
}

function SubscriptionEditPanel({
  order,
  onSaved,
}: {
  order: CustomerDetailOrder;
  onSaved: () => void;
}) {
  const [postalCode, setPostalCode] = useState(order.shipping_address?.postalCode ?? "");
  const [prefecture, setPrefecture] = useState(order.shipping_address?.prefecture ?? "");
  const [city, setCity] = useState(order.shipping_address?.city ?? "");
  const [line1, setLine1] = useState(order.shipping_address?.line1 ?? "");
  const [line2, setLine2] = useState(order.shipping_address?.line2 ?? "");
  const [recipientName, setRecipientName] = useState(order.shipping_address?.recipientName ?? "");
  const [recipientPhone, setRecipientPhone] = useState(order.shipping_address?.recipientPhone ?? "");
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState(order.delivery_time_slot ?? "");
  const [subscriptionInterval, setSubscriptionInterval] = useState<SubscriptionInterval>(
    (order.subscriptions?.[0]?.interval as SubscriptionInterval) ?? "monthly",
  );
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const skipResetRef = useRef(true);

  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setJustSaved(false);
  }, [postalCode, prefecture, city, line1, line2, recipientName, recipientPhone, deliveryTimeSlot, subscriptionInterval]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    const res = await fetch(`/api/orders/${order.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shippingAddress:
          postalCode && prefecture && city && line1 && recipientName && recipientPhone
            ? { postalCode, prefecture, city, line1, line2: line2 || undefined, recipientName, recipientPhone }
            : null,
        deliveryTimeSlot,
        // 頻度変更はStripeの定期購入のみ対応(代引き・後払いはStripeサブスクリプションが無いため対象外)。
        ...(order.payment_method === "stripe" && { subscriptionInterval }),
      }),
    });

    setSaving(false);
    if (res.ok) {
      setJustSaved(true);
      setToast({ message: "保存しました", type: "success" });
      onSaved();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "保存に失敗しました", type: "error" });
    }
  }

  async function handleCancel() {
    if (!window.confirm("この定期購入を解約します。よろしいですか?")) return;
    setCanceling(true);
    setToast(null);

    const res = await fetch(`/api/orders/${order.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelSubscription: true }),
    });

    setCanceling(false);
    if (res.ok) {
      setToast({ message: "解約しました", type: "success" });
      onSaved();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "解約に失敗しました", type: "error" });
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <h2 className="text-lg font-semibold">定期購入の変更(顧客からの申告対応)</h2>
      <p className="text-xs text-neutral-500">
        金額が変わる変更(商品変更等)は再注文が必要です。ここではお届け先・お届け頻度の変更、解約のみ行えます。
        変更内容は、次回以降の定期便に自動的に反映されます。
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">郵便番号</span>
          <input className="input" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">都道府県</span>
          <input className="input" value={prefecture} onChange={(e) => setPrefecture(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">市区町村</span>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">住所1</span>
          <input className="input" value={line1} onChange={(e) => setLine1(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">住所2(任意)</span>
          <input className="input" value={line2} onChange={(e) => setLine2(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">お届け時間帯</span>
          <input className="input" value={deliveryTimeSlot} onChange={(e) => setDeliveryTimeSlot(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">お届け先氏名</span>
          <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">お届け先電話番号</span>
          <input className="input" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
        </label>
      </div>

      {order.payment_method === "stripe" && (
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">お届け頻度</span>
          <select
            className="input max-w-xs"
            value={subscriptionInterval}
            onChange={(e) => setSubscriptionInterval(e.target.value as SubscriptionInterval)}
          >
            {(Object.keys(INTERVAL_LABELS) as SubscriptionInterval[]).map((key) => (
              <option key={key} value={key}>
                {INTERVAL_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : justSaved ? "保存済み" : "保存する"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={canceling}
          className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {canceling ? "解約中..." : "この定期を解約する"}
        </button>
      </div>
    </form>
  );
}
