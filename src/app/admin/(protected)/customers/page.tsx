import { getCustomerSummaries, type SmaregiFilter, type SubscriptionStatusFilter } from "@/lib/customer-summaries";
import { CustomersTable } from "@/components/admin/CustomersTable";

export const dynamic = "force-dynamic";

const SUBSCRIPTION_STATUS_OPTIONS: { value: SubscriptionStatusFilter; label: string }[] = [
  { value: "active", label: "定期継続中" },
  { value: "canceled", label: "定期解約済み" },
  { value: "none", label: "定期未注文" },
];

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const getParam = (key: string) => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const q = getParam("q") || "";
  const subscriptionStatusRaw = getParam("subscriptionStatus");
  const subscriptionStatus = SUBSCRIPTION_STATUS_OPTIONS.some((o) => o.value === subscriptionStatusRaw)
    ? (subscriptionStatusRaw as SubscriptionStatusFilter)
    : undefined;
  const smaregiFilterRaw = getParam("smaregiFilter");
  const smaregiFilter: SmaregiFilter =
    smaregiFilterRaw === "include" || smaregiFilterRaw === "only" ? smaregiFilterRaw : "exclude";

  let customers: Awaited<ReturnType<typeof getCustomerSummaries>> = [];
  let loadError: string | null = null;
  try {
    customers = await getCustomerSummaries({ q, subscriptionStatus, smaregiFilter });
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error("[admin/customers] failed to load customer summaries", err);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">顧客管理</h1>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="mb-1 font-semibold">顧客データの取得に失敗しました。</p>
          <p className="whitespace-pre-wrap break-all">{loadError}</p>
        </div>
      )}

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
      >
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">
            顧客名・メールアドレス・電話番号・商品コード・商品名で絞り込み
          </span>
          <input type="text" name="q" defaultValue={q} placeholder="部分一致" className="input" />
        </label>

        <div>
          <span className="mb-1 block text-xs text-neutral-500">定期状態</span>
          <div className="flex gap-3 rounded-md border border-neutral-200 px-3 py-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="radio" name="subscriptionStatus" value="" defaultChecked={!subscriptionStatus} />
              すべて
            </label>
            {SUBSCRIPTION_STATUS_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="subscriptionStatus"
                  value={o.value}
                  defaultChecked={subscriptionStatus === o.value}
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">スマレジ連携状態</span>
          <select name="smaregiFilter" defaultValue={smaregiFilter} className="input">
            <option value="exclude">連携済みデータを省く</option>
            <option value="include">連携済みデータを含める</option>
            <option value="only">連携済みのみ表示</option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          絞り込む
        </button>
      </form>

      <CustomersTable customers={customers} />
    </div>
  );
}
