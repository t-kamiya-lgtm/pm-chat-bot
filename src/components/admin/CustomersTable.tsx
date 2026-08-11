import Link from "next/link";
import type { CustomerSummary } from "@/lib/customer-summaries";

const SUBSCRIPTION_STATUS_LABELS: Record<CustomerSummary["subscriptionStatus"], string> = {
  active: "定期継続中",
  canceled: "定期解約済み",
  none: "定期未注文",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ja-JP");
}

export function CustomersTable({ customers }: { customers: CustomerSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-neutral-50 text-xs text-neutral-500">
          <tr>
            <th className="px-4 py-2">顧客ID</th>
            <th className="px-4 py-2">顧客名</th>
            <th className="px-4 py-2">顧客種別</th>
            <th className="px-4 py-2">注文商品</th>
            <th className="px-4 py-2">定期状態</th>
            <th className="px-4 py-2">定期累計購入回数</th>
            <th className="px-4 py-2">定期累計購入金額</th>
            <th className="px-4 py-2">次回発送予定日</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {customers.map((c) => (
            <tr key={c.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 font-mono">{c.customerNumber}</td>
              <td className="px-4 py-2">
                <Link href={`/admin/customers/${c.id}`} className="text-blue-600 hover:underline">
                  {c.name}
                </Link>
              </td>
              <td className="px-4 py-2">{c.customerType}</td>
              <td className="px-4 py-2">{c.productName ?? "-"}</td>
              <td className="px-4 py-2">{SUBSCRIPTION_STATUS_LABELS[c.subscriptionStatus]}</td>
              <td className="px-4 py-2">{c.totalSubscriptionCount}</td>
              <td className="px-4 py-2">{c.totalSubscriptionAmount.toLocaleString()}円</td>
              <td className="px-4 py-2 whitespace-nowrap">{formatDate(c.nextShippingDate)}</td>
            </tr>
          ))}
          {customers.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                該当する顧客がいません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
