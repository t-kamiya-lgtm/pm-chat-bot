import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export default async function AdminOrdersPage() {
  const supabase = createSupabaseAdminClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("*, customers(name, email), products(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  function formatDeliveryDate(value: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("ja-JP");
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">注文</h1>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">日時</th>
              <th className="px-4 py-2">顧客</th>
              <th className="px-4 py-2">商品</th>
              <th className="px-4 py-2">種別</th>
              <th className="px-4 py-2">支払い方法</th>
              <th className="px-4 py-2">金額</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2">お届け希望日時</th>
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
                  shipping_fee: number;
                  payment_fee: number;
                  status: string;
                  delivery_date: string | null;
                  delivery_time_slot: string | null;
                  customers: { name: string; email: string } | null;
                  products: { name: string } | null;
                },
              ) => (
                <tr key={order.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {new Date(order.created_at).toLocaleString("ja-JP")}
                  </td>
                  <td className="px-4 py-2">{order.customers?.name ?? "-"}</td>
                  <td className="px-4 py-2">{order.products?.name ?? "-"}</td>
                  <td className="px-4 py-2">{order.type === "subscription" ? "定期" : "単発"}</td>
                  <td className="px-4 py-2">{PAYMENT_METHOD_LABELS[order.payment_method]}</td>
                  <td className="px-4 py-2">
                    {(order.amount + order.shipping_fee + order.payment_fee).toLocaleString()}円
                  </td>
                  <td className="px-4 py-2">{STATUS_LABELS[order.status]}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {formatDeliveryDate(order.delivery_date)} {order.delivery_time_slot ?? ""}
                  </td>
                </tr>
              ),
            )}
            {!orders?.length && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
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
