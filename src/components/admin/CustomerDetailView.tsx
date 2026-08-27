"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import type { Address, SubscriptionInterval } from "@/lib/types";
import type {
  CustomerDetailOrder,
  CustomerDetailSubscription,
  CustomerRetentionAction,
  CustomerRetentionCampaignType,
} from "@/lib/customer-detail";
import type { CustomerChangeLogRow } from "@/lib/customer-change-log";

const INTERVAL_LABELS: Record<string, string> = {
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

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "継続中",
  paused: "一時停止",
  canceled: "解約済み",
};

const CONFIRMED_ORDER_STATUSES = ["paid", "accepted"];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ja-JP");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

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

interface ProductOption {
  id: string;
  name: string;
  price: number;
  first_time_price: number | null;
  order_type: "one_time" | "subscription";
  subscription_intervals: SubscriptionInterval[];
  smaregi_product_id: string | null;
  shipping_fee: number;
}

function useProductOptions(enabled: boolean) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/products")
      .then((r) => r.json())
      .then((body) => setProducts(body.products ?? []))
      .catch(() => setProducts([]));
  }, [enabled]);
  return products;
}

export function CustomerDetailView({
  customer,
  orders,
  changeLogs,
  tenureMonths,
  availableCampaignTypes,
  retentionActions,
  isAdmin,
}: {
  customer: {
    id: string;
    customerNumber: number | null;
    name: string;
    nameKana: string | null;
    email: string;
    phone: string | null;
    address: Address | null;
    createdAt: string;
    isMasked: boolean;
  };
  orders: CustomerDetailOrder[];
  changeLogs: CustomerChangeLogRow[];
  tenureMonths: number | null;
  availableCampaignTypes: CustomerRetentionCampaignType[];
  retentionActions: CustomerRetentionAction[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [expandedSurvey, setExpandedSurvey] = useState<string | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const subscriptionOrders = useMemo(
    () => orders.filter((o) => o.type === "subscription" && !o.parent_order_id),
    [orders],
  );
  const activeSubscriptions = useMemo(
    () =>
      subscriptionOrders
        .filter((o) => o.subscriptions?.[0]?.status === "active")
        .map((o) => ({ order: o, subscription: o.subscriptions![0] })),
    [subscriptionOrders],
  );

  const confirmedOrders = orders.filter((o) => CONFIRMED_ORDER_STATUSES.includes(o.status));
  const totalPurchaseCount = confirmedOrders.length;
  const totalPurchaseAmount = confirmedOrders.reduce((sum, o) => sum + orderTotal(o), 0);

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
          {tenureMonths !== null && (
            <span>
              継続期間(定期初回注文から、休止期間を除く):{" "}
              <strong className="text-neutral-900">
                {tenureMonths >= 12 ? `${Math.floor(tenureMonths / 12)}年${tenureMonths % 12}ヶ月` : `${tenureMonths}ヶ月`}
              </strong>
            </span>
          )}
        </div>
      </div>

      {customer.isMasked && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          電話番号・メールアドレス・詳細な住所はマスク表示されています(admin権限のみフル表示・編集できます)。
        </p>
      )}

      {/* ① 注文内容 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">① 注文内容</h2>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowNewOrder((v) => !v)}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
            >
              ＋ 新規注文登録
            </button>
          )}
        </div>

        {showNewOrder && (
          <NewOrderForm
            customerId={customer.id}
            activeSubscriptions={activeSubscriptions}
            onDone={() => {
              setShowNewOrder(false);
              router.refresh();
            }}
            onCancel={() => setShowNewOrder(false)}
          />
        )}

        {subscriptionOrders.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-400">
            定期購入・進行中の注文はありません
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {subscriptionOrders.map((order) => (
            <OrderContentCard key={order.id} order={order} isAdmin={isAdmin} onSaved={() => router.refresh()} />
          ))}
        </div>
      </section>

      {/* ② 注文者情報 */}
      <CustomerInfoSection customer={customer} isAdmin={isAdmin} onSaved={() => router.refresh()} />

      {/* ③ お届け先情報 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">③ お届け先情報</h2>
        {activeSubscriptions.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            <p className="text-neutral-500">現在有効な定期契約がありません(注文者情報の住所を使用します)。</p>
          </div>
        ) : (
          activeSubscriptions.map(({ order }) => (
            <ShippingInfoCard key={order.id} order={order} isAdmin={isAdmin} onSaved={() => router.refresh()} />
          ))
        )}
      </section>

      {/* ④ 購入履歴 */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">④ 購入履歴</h2>
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
                  <td className="px-4 py-2">
                    {o.subscription_item_id && (
                      <span className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">同梱</span>
                    )}
                    {o.products?.name ?? "-"}
                  </td>
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

      {/* ⑤ 変更履歴 */}
      <ChangeHistorySection changeLogs={changeLogs} isAdmin={isAdmin} />

      {/* ⑥ 継続施策 */}
      <RetentionActionsSection
        customerId={customer.id}
        subscriptionOrders={subscriptionOrders}
        availableCampaignTypes={availableCampaignTypes}
        retentionActions={retentionActions}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function OrderContentCard({
  order,
  isAdmin,
  onSaved,
}: {
  order: CustomerDetailOrder;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const sub = order.subscriptions?.[0];
  const isStripe = order.payment_method === "stripe";
  const isActive = sub?.status === "active";
  const [editing, setEditing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const productCode = sub?.override_product?.smaregi_product_id ?? order.products?.smaregi_product_id ?? "-";
  const productName = sub?.override_product?.name ?? order.products?.name ?? "-";
  const firstTimePrice = order.amount - (order.first_time_discount_amount ?? 0);
  const recurringPrice = sub?.override_amount ?? order.amount;
  const effectivePaymentMethod = sub?.override_payment_method ?? order.payment_method;

  async function callEdit(payload: Record<string, unknown>) {
    setBusy(true);
    setToast(null);
    const res = await fetch(`/api/orders/${order.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      setToast({ message: "保存しました", type: "success" });
      onSaved();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "保存に失敗しました", type: "error" });
    }
    return res.ok;
  }

  async function handleCancel() {
    if (!window.confirm("この定期購入を解約します。よろしいですか?")) return;
    await callEdit({ cancelSubscription: true });
  }

  async function handleGenerateNow() {
    if (!window.confirm("次回分の注文データをすぐに生成します。よろしいですか?")) return;
    await callEdit({ generateNow: true });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm shadow-sm">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-neutral-400">{productCode}</div>
          <div className="text-base font-semibold">{productName}</div>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isActive ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {SUBSCRIPTION_STATUS_LABELS[sub?.status ?? "canceled"]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-neutral-400">初回価格</div>
          <div className="font-medium">{firstTimePrice.toLocaleString()}円</div>
        </div>
        <div>
          <div className="text-xs text-neutral-400">2回目以降価格</div>
          <div className="font-medium">{recurringPrice.toLocaleString()}円</div>
        </div>
        <div>
          <div className="text-xs text-neutral-400">お届け頻度</div>
          <div className="font-medium">{INTERVAL_LABELS[sub?.interval ?? ""] ?? "-"}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-400">決済方法</div>
          <div className="font-medium">{PAYMENT_METHOD_LABELS[effectivePaymentMethod] ?? effectivePaymentMethod}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-400">次回お届け予定日</div>
          <div className="font-medium">{isActive ? formatDate(sub?.next_billing_date ?? null) : "-"}</div>
        </div>
      </div>

      {sub && sub.items.length > 0 && (
        <div className="space-y-1 rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-2">
          <div className="text-xs text-neutral-400">同梱商品</div>
          {sub.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-xs">
              <span>
                {item.products?.name ?? item.product_id} × {item.quantity}(¥{item.unit_amount.toLocaleString()})
              </span>
              {isAdmin && !isStripe && (
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  onClick={async () => {
                    if (!window.confirm("この同梱商品を終了します。よろしいですか?")) return;
                    const res = await fetch(`/api/orders/${order.id}/subscription-items`, {
                      method: "DELETE",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ subscriptionItemId: item.id }),
                    });
                    if (res.ok) onSaved();
                  }}
                >
                  終了
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2">
          <div className="flex flex-wrap gap-2">
            {isActive ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  解約
                </button>
                {!isStripe && (
                  <button
                    type="button"
                    onClick={handleGenerateNow}
                    disabled={busy}
                    className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                  >
                    今すぐ注文データ生成
                  </button>
                )}
              </>
            ) : (
              <>
                {isStripe ? (
                  <span className="text-xs text-neutral-400">
                    Stripeは再開に対応していません(お客様に再度注文いただいてください)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setResuming((v) => !v)}
                    className="rounded-md bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700"
                  >
                    再開
                  </button>
                )}
              </>
            )}
          </div>
          <span className="text-[11px] text-neutral-400">🔒 admin限定</span>
        </div>
      )}

      {editing && isActive && (
        <ContentEditForm
          order={order}
          subscription={sub!}
          isStripe={isStripe}
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {resuming && !isActive && !isStripe && (
        <ResumeForm
          order={order}
          onSaved={() => {
            setResuming(false);
            onSaved();
          }}
          onCancel={() => setResuming(false)}
        />
      )}
    </div>
  );
}

function ContentEditForm({
  order,
  subscription,
  isStripe,
  onSaved,
  onCancel,
}: {
  order: CustomerDetailOrder;
  subscription: CustomerDetailSubscription;
  isStripe: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const products = useProductOptions(true);
  const [productId, setProductId] = useState(subscription.override_product_id ?? "");
  const [amount, setAmount] = useState(subscription.override_amount ?? order.amount);
  const [paymentMethod, setPaymentMethod] = useState(subscription.override_payment_method ?? order.payment_method);
  const [interval, setInterval] = useState<SubscriptionInterval>((subscription.interval as SubscriptionInterval) ?? "monthly");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    const payload: Record<string, unknown> = {};
    if (isStripe) {
      payload.subscriptionInterval = interval;
    } else {
      payload.contentOverride = {
        ...(productId && productId !== subscription.override_product_id && { productId }),
        ...(amount !== (subscription.override_amount ?? order.amount) && { amount }),
        ...(paymentMethod !== (subscription.override_payment_method ?? order.payment_method) && {
          paymentMethod: paymentMethod as "cod" | "deferred_invoice",
        }),
        ...(interval !== subscription.interval && { interval }),
      };
    }
    const res = await fetch(`/api/orders/${order.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "保存に失敗しました", type: "error" });
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      {isStripe ? (
        <p className="text-neutral-500">
          Stripeの定期購入は、お届け頻度のみ変更できます。商品・金額・決済方法の変更はお客様に再度注文いただいてください。
        </p>
      ) : (
        <p className="text-neutral-500">初回価格は変更できません。送料・決済手数料は変更後の内容に合わせて自動計算されます。</p>
      )}

      <label className="block">
        <span className="mb-1 block text-neutral-500">お届け頻度</span>
        <select
          className="input"
          value={interval}
          onChange={(e) => setInterval(e.target.value as SubscriptionInterval)}
        >
          {(Object.keys(INTERVAL_LABELS) as string[]).map((key) => (
            <option key={key} value={key}>
              {INTERVAL_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      {!isStripe && (
        <>
          <label className="block">
            <span className="mb-1 block text-neutral-500">商品コード</span>
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">(変更しない)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.smaregi_product_id ?? p.id.slice(0, 8)} - {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-neutral-500">2回目以降価格</span>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-neutral-500">決済方法</span>
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cod">代金引換</option>
              <option value="deferred_invoice">後払い</option>
            </select>
          </label>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="rounded-md bg-neutral-900 px-3 py-1 text-white">
          保存する
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-neutral-300 px-3 py-1">
          キャンセル
        </button>
      </div>
    </form>
  );
}

function ResumeForm({
  order,
  onSaved,
  onCancel,
}: {
  order: CustomerDetailOrder;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [nextBillingDate, setNextBillingDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!nextBillingDate) return;
    setSaving(true);
    setToast(null);
    const res = await fetch(`/api/orders/${order.id}/edit`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resumeSubscription: { nextBillingDate } }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "再開に失敗しました", type: "error" });
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <p className="text-neutral-500">次回お届け日を設定して保存すると、以後この日付を起点に定期便の生成が再開します。</p>
      <label className="block">
        <span className="mb-1 block text-neutral-500">次回お届け予定日</span>
        <input
          type="date"
          className="input"
          value={nextBillingDate}
          onChange={(e) => setNextBillingDate(e.target.value)}
          required
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="rounded-md bg-neutral-900 px-3 py-1 text-white">
          保存して再開する
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-neutral-300 px-3 py-1">
          キャンセル
        </button>
      </div>
    </form>
  );
}

function CustomerInfoSection({
  customer,
  isAdmin,
  onSaved,
}: {
  customer: {
    id: string;
    name: string;
    nameKana: string | null;
    email: string;
    phone: string | null;
    address: Address | null;
    createdAt: string;
  };
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [nameKana, setNameKana] = useState(customer.nameKana ?? "");
  const [email, setEmail] = useState(customer.email);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [postalCode, setPostalCode] = useState(customer.address?.postalCode ?? "");
  const [prefecture, setPrefecture] = useState(customer.address?.prefecture ?? "");
  const [city, setCity] = useState(customer.address?.city ?? "");
  const [line1, setLine1] = useState(customer.address?.line1 ?? "");
  const [line2, setLine2] = useState(customer.address?.line2 ?? "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    const res = await fetch(`/api/customers/${customer.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        nameKana,
        email,
        phone: phone || null,
        address: postalCode && prefecture && city && line1 ? { postalCode, prefecture, city, line1, line2: line2 || undefined } : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      onSaved();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "保存に失敗しました", type: "error" });
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">② 注文者情報</h2>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
          >
            {editing ? "閉じる" : "編集"}
          </button>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {editing ? (
        <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
          <p className="text-xs text-neutral-400 sm:col-span-2">メール・氏名・電話番号は、Stripe顧客情報にも同期されます。</p>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">氏名</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">フリガナ</span>
            <input className="input" value={nameKana} onChange={(e) => setNameKana(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">メールアドレス</span>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">電話番号</span>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
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
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">住所2(任意)</span>
            <input className="input" value={line2} onChange={(e) => setLine2(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
              保存する
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
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
      )}
    </section>
  );
}

function ShippingInfoCard({
  order,
  isAdmin,
  onSaved,
}: {
  order: CustomerDetailOrder;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [postalCode, setPostalCode] = useState(order.shipping_address?.postalCode ?? "");
  const [prefecture, setPrefecture] = useState(order.shipping_address?.prefecture ?? "");
  const [city, setCity] = useState(order.shipping_address?.city ?? "");
  const [line1, setLine1] = useState(order.shipping_address?.line1 ?? "");
  const [line2, setLine2] = useState(order.shipping_address?.line2 ?? "");
  const [recipientName, setRecipientName] = useState(order.shipping_address?.recipientName ?? "");
  const [recipientPhone, setRecipientPhone] = useState(order.shipping_address?.recipientPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const skipResetRef = useRef(true);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setJustSaved(false);
  }, [postalCode, prefecture, city, line1, line2, recipientName, recipientPhone]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
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
      }),
    });
    setSaving(false);
    if (res.ok) {
      setJustSaved(true);
      onSaved();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "保存に失敗しました", type: "error" });
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-neutral-400">
          {order.products?.smaregi_product_id ?? "-"} {order.products?.name ?? "-"} のお届け先
        </span>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
          >
            {editing ? "閉じる" : "編集"}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="grid grid-cols-2 gap-2">
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
            <span className="mb-1 block text-xs text-neutral-500">お届け先氏名</span>
            <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">お届け先電話番号</span>
            <input className="input" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
          </label>
          <div className="col-span-2">
            <button type="submit" disabled={saving} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
              {saving ? "保存中..." : justSaved ? "保存済み" : "保存する"}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {order.shipping_address ? (
            <>
              <div>
                <span className="block text-xs text-neutral-500">お届け先氏名</span>
                {order.shipping_address.recipientName}
              </div>
              <div>
                <span className="block text-xs text-neutral-500">お届け先電話番号</span>
                {order.shipping_address.recipientPhone}
              </div>
              <div className="sm:col-span-2">
                <span className="block text-xs text-neutral-500">お届け先住所</span>
                <AddressText address={order.shipping_address} />
              </div>
            </>
          ) : (
            <p className="text-neutral-500 sm:col-span-2">注文者情報の住所と同じです</p>
          )}
        </div>
      )}
    </div>
  );
}

function NewOrderForm({
  customerId,
  activeSubscriptions,
  onDone,
  onCancel,
}: {
  customerId: string;
  activeSubscriptions: { order: CustomerDetailOrder; subscription: CustomerDetailSubscription }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const products = useProductOptions(true);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "deferred_invoice">("cod");
  const [interval, setInterval] = useState<SubscriptionInterval>("monthly");
  const [deliveryTiming, setDeliveryTiming] = useState<"bundle_next" | "ship_now_then_bundle" | "separate">("separate");
  const [alignToId, setAlignToId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const orderKind = selectedProduct?.order_type ?? "one_time";
  const alignedTarget = activeSubscriptions.find((s) => s.subscription.id === alignToId) ?? null;

  function handleSelectProduct(newProductId: string) {
    setProductId(newProductId);
    const product = products.find((p) => p.id === newProductId);
    if (!product) return;
    setAmount(product.first_time_price ?? product.price);
    if (product.order_type === "subscription" && product.subscription_intervals[0]) {
      setInterval(product.subscription_intervals[0]);
    }
  }

  const isMerge =
    orderKind === "subscription" &&
    deliveryTiming !== "separate" &&
    alignedTarget !== null &&
    alignedTarget.subscription.interval === interval;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    setSaving(true);
    setToast(null);

    try {
      if (isMerge && alignedTarget) {
        const res = await fetch(`/api/orders/${alignedTarget.order.id}/subscription-items`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ productId, quantity, unitAmount: amount }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "追加に失敗しました");
        if (deliveryTiming === "ship_now_then_bundle") {
          const res2 = await fetch(`/api/customers/${customerId}/new-order`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              productId,
              quantity,
              amount,
              paymentMethod,
              orderKind: "one_time",
              deliveryTiming: "separate",
              deliveryDate: new Date().toISOString().slice(0, 10),
            }),
          });
          if (!res2.ok) throw new Error((await res2.json().catch(() => null))?.error ?? "即時出荷分の作成に失敗しました");
        }
      } else {
        const res = await fetch(`/api/customers/${customerId}/new-order`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productId,
            quantity,
            amount,
            paymentMethod,
            orderKind,
            subscriptionInterval: orderKind === "subscription" ? interval : undefined,
            deliveryTiming,
            alignToSubscriptionId: alignedTarget?.subscription.id,
            deliveryDate: deliveryDate || undefined,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "登録に失敗しました");
      }
      onDone();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "登録に失敗しました", type: "error" });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-500">
        同一頻度の商品を「同梱」タイミングで追加すると、既存の定期プランに統合されます。頻度が異なる場合や「別送」を選ぶと、独立した注文/定期として作成されます。
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">商品品番</span>
          <select className="input" value={productId} onChange={(e) => handleSelectProduct(e.target.value)} required>
            <option value="">選択してください</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.smaregi_product_id ?? p.id.slice(0, 8)} - {p.name}({p.order_type === "subscription" ? "定期" : "単品"})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">数量</span>
          <input
            type="number"
            min={1}
            className="input"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">金額(サジェスト、変更可)</span>
          <input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">決済方法</span>
          <select
            className="input"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as "cod" | "deferred_invoice")}
          >
            <option value="cod">代金引換</option>
            <option value="deferred_invoice">後払い</option>
          </select>
        </label>

        {orderKind === "subscription" && (
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">お届け頻度</span>
            <select className="input" value={interval} onChange={(e) => setInterval(e.target.value as SubscriptionInterval)}>
              {(Object.keys(INTERVAL_LABELS) as string[]).map((key) => (
                <option key={key} value={key}>
                  {INTERVAL_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">お届けタイミング</span>
          <select
            className="input"
            value={deliveryTiming}
            onChange={(e) => setDeliveryTiming(e.target.value as typeof deliveryTiming)}
          >
            <option value="separate">別送</option>
            <option value="bundle_next">次回お届けより同梱</option>
            {orderKind === "subscription" && <option value="ship_now_then_bundle">初回は即出荷し、次回より同梱</option>}
          </select>
        </label>

        {deliveryTiming !== "separate" && activeSubscriptions.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">同梱の基準にする既存の定期</span>
            <select className="input" value={alignToId} onChange={(e) => setAlignToId(e.target.value)}>
              <option value="">選択してください</option>
              {activeSubscriptions.map(({ subscription, order }) => (
                <option key={subscription.id} value={subscription.id}>
                  {order.products?.name ?? "-"}(次回: {formatDate(subscription.next_billing_date)} / {INTERVAL_LABELS[subscription.interval]})
                </option>
              ))}
            </select>
          </label>
        )}

        {deliveryTiming === "separate" && (
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">お届け開始日(未指定なら今日)</span>
            <input type="date" className="input" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </label>
        )}
      </div>

      {isMerge && (
        <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700">
          同一頻度のため、既存の定期プランへの同梱として登録されます。
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
          登録する
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">
          キャンセル
        </button>
      </div>
    </form>
  );
}

function ChangeHistorySection({
  changeLogs,
  isAdmin,
}: {
  changeLogs: CustomerChangeLogRow[];
  isAdmin: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">⑤ 変更履歴</h2>
        {!isAdmin && (
          <span className="text-xs text-neutral-400">🔒 個人情報を含む変更内容は伏字で表示されています</span>
        )}
      </div>
      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {changeLogs.length === 0 && <p className="p-4 text-sm text-neutral-400">変更履歴はありません</p>}
        {changeLogs.map((log) => (
          <div key={log.id} className="p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{actionLabel(log.action)}</span>
              <span className="text-xs text-neutral-400">{formatDateTime(log.created_at)}</span>
            </div>
            <div className="mt-1 space-y-0.5 text-xs text-neutral-600">
              {log.changes.map((c, i) => (
                <div key={i}>
                  {c.label}: {c.before !== null && <span className="text-red-500 line-through">{c.before}</span>}
                  {c.before !== null && c.after !== null && " → "}
                  {c.after !== null && <span className="font-semibold text-emerald-700">{c.after}</span>}
                </div>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-neutral-400">変更者: {log.changed_by_email}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMonth(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function RetentionActionsSection({
  customerId,
  subscriptionOrders,
  availableCampaignTypes,
  retentionActions,
  isAdmin,
}: {
  customerId: string;
  subscriptionOrders: CustomerDetailOrder[];
  availableCampaignTypes: CustomerRetentionCampaignType[];
  retentionActions: CustomerRetentionAction[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [campaignTypeId, setCampaignTypeId] = useState("");
  const [performedMonth, setPerformedMonth] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignTypeId || !performedMonth) return;
    setSaving(true);
    setToast(null);
    const res = await fetch(`/api/customers/${customerId}/retention-actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignTypeId,
        performedMonth,
        subscriptionId: subscriptionId || undefined,
        detail: detail.trim() || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setShowForm(false);
      setCampaignTypeId("");
      setPerformedMonth("");
      setSubscriptionId("");
      setDetail("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ? JSON.stringify(body.error) : "登録に失敗しました", type: "error" });
    }
  }

  async function handleDelete(actionId: string) {
    if (!window.confirm("この施策ログを削除します。よろしいですか?")) return;
    const res = await fetch(`/api/customers/${customerId}/retention-actions/${actionId}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setToast({ message: body?.error ?? "削除に失敗しました", type: "error" });
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">⑥ 継続施策</h2>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
          >
            {showForm ? "閉じる" : "＋ 施策を記録"}
          </button>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {showForm && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
          {availableCampaignTypes.length === 0 ? (
            <p className="text-xs text-amber-700 sm:col-span-2">
              このブランドには継続施策タイトルが登録されていません。ブランド管理画面で先に登録してください。
            </p>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-500">施策タイトル</span>
              <select className="input" value={campaignTypeId} onChange={(e) => setCampaignTypeId(e.target.value)} required>
                <option value="">選択してください</option>
                {availableCampaignTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-500">実施年月</span>
            <input
              type="month"
              className="input"
              value={performedMonth}
              onChange={(e) => setPerformedMonth(e.target.value)}
              required
            />
          </label>
          {subscriptionOrders.length > 0 && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">対象の定期(任意)</span>
              <select className="input" value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)}>
                <option value="">指定しない</option>
                {subscriptionOrders.map((o) =>
                  o.subscriptions?.[0] ? (
                    <option key={o.subscriptions[0].id} value={o.subscriptions[0].id}>
                      {o.products?.name ?? "-"}
                    </option>
                  ) : null,
                )}
              </select>
            </label>
          )}
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">施策詳細(任意)</span>
            <textarea className="input" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving || availableCampaignTypes.length === 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              記録する
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        {retentionActions.length === 0 && <p className="p-4 text-sm text-neutral-400">記録された継続施策はありません</p>}
        {retentionActions.map((a) => (
          <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{formatMonth(a.performedMonth)}</span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">{a.campaignTitle}</span>
              </div>
              {a.detail && <div className="mt-1 text-xs text-neutral-600">{a.detail}</div>}
            </div>
            {isAdmin && (
              <button type="button" onClick={() => handleDelete(a.id)} className="text-xs text-red-600 hover:underline">
                削除
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    customer_info_update: "注文者情報変更",
    shipping_address_update: "お届け先情報変更",
    subscription_content_update: "注文内容変更",
    subscription_item_add: "同梱商品追加",
    subscription_item_remove: "同梱商品終了",
    subscription_cancel: "定期解約",
    subscription_resume: "定期再開",
    subscription_skip: "1回スキップ",
    new_order_created: "新規注文登録",
  };
  return labels[action] ?? action;
}
