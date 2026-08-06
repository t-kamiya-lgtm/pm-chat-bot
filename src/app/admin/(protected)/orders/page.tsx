import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readOrderFilters, applyOrderFilters } from "@/lib/order-filters";
import { OrderImportToggle } from "@/components/admin/OrderImportToggle";

export const dynamic = "force-dynamic";

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

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const getParam = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const filters = readOrderFilters(getParam);

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("orders")
    .select("*, customers(name, email), products(name)")
    .order("created_at", { ascending: false });
  query = applyOrderFilters(query, filters);
  if (!filters.showAll) query = query.limit(100);

  const { data: orders } = await query;

  function formatSurveyResponses(value: Record<string, string> | null) {
    if (!value || Object.keys(value).length === 0) return null;
    return Object.entries(value)
      .map(([q, a]) => `${q}: ${a}`)
      .join("\n");
  }

  function formatDeliveryDate(value: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("ja-JP");
  }

  const currentQuery = new URLSearchParams();
  if (filters.dateFrom) currentQuery.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) currentQuery.set("dateTo", filters.dateTo);
  if (filters.orderType) currentQuery.set("orderType", filters.orderType);
  if (filters.importStatus) currentQuery.set("importStatus", filters.importStatus);

  const exportQuery = new URLSearchParams(currentQuery);
  if (filters.showAll) exportQuery.set("showAll", "1");

  const showAllQuery = new URLSearchParams(currentQuery);
  showAllQuery.set("showAll", "1");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">注文</h1>
        <a
          href={`/api/orders/export?${exportQuery.toString()}`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          この絞り込み結果をCSV出力
        </a>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">日付(から)</span>
          <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">日付(まで)</span>
          <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">種別</span>
          <select name="orderType" defaultValue={filters.orderType ?? ""} className="input">
            <option value="">すべて</option>
            <option value="one_time">単発</option>
            <option value="subscription">定期</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">取り込みステータス</span>
          <select name="importStatus" defaultValue={filters.importStatus ?? ""} className="input">
            <option value="">すべて</option>
            <option value="imported">取り込み済み</option>
            <option value="not_imported">未取り込み</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          絞り込む
        </button>
        <a
          href={`/admin/orders?${showAllQuery.toString()}`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          全データ表示
        </a>
      </form>

      {!filters.showAll && (
        <p className="mb-2 text-xs text-neutral-400">直近100件のみ表示しています。「全データ表示」ですべて表示します。</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
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
              <th className="px-4 py-2">取り込み</th>
            </tr>
          </thead>
          <tbody>
            {orders?.map(
              (
                order: {
                  id: string;
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
                  imported: boolean;
                  customers: { name: string; email: string } | null;
                  products: { name: string } | null;
                },
              ) => {
                const surveyText = formatSurveyResponses(order.survey_responses);
                return (
                  <tr key={order.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(order.created_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-2">{order.customers?.name ?? "-"}</td>
                    <td className="px-4 py-2">{order.products?.name ?? "-"}</td>
                    <td className="px-4 py-2">{order.quantity}</td>
                    <td className="px-4 py-2">{order.type === "subscription" ? "定期" : "単発"}</td>
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
                      <OrderImportToggle orderId={order.id} initialImported={order.imported} />
                    </td>
                  </tr>
                );
              },
            )}
            {!orders?.length && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-neutral-400">
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
