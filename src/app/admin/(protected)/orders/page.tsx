import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readOrderFilters, applyOrderFilters } from "@/lib/order-filters";
import { OrdersTable } from "@/components/admin/OrdersTable";

export const dynamic = "force-dynamic";

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
    .select("*, customers(name, email), products!product_id(name)")
    .order("created_at", { ascending: false });
  query = applyOrderFilters(query, filters);
  if (!filters.showAll) query = query.limit(100);

  const { data: orders, error: ordersError } = await query;
  if (ordersError) console.error("[admin/orders] failed to load orders", ordersError);

  const currentQuery = new URLSearchParams();
  if (filters.dateFrom) currentQuery.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) currentQuery.set("dateTo", filters.dateTo);
  if (filters.orderType) currentQuery.set("orderType", filters.orderType);
  if (filters.importStatus) currentQuery.set("importStatus", filters.importStatus);
  if (filters.canceledFilter !== "include") currentQuery.set("canceledFilter", filters.canceledFilter);

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

      <form
        method="get"
        className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
      >
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
            <option value="on_hold">保留</option>
            <option value="not_imported">未取り込み</option>
            <option value="import_error">取込みエラー</option>
            <option value="excluded">対象外</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">キャンセル</span>
          <select name="canceledFilter" defaultValue={filters.canceledFilter} className="input">
            <option value="include">すべて</option>
            <option value="exclude">キャンセル済みを除く</option>
            <option value="only">キャンセル済みのみ</option>
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
        <p className="mb-2 text-xs text-neutral-400">
          直近100件のみ表示しています。「全データ表示」ですべて表示します。
        </p>
      )}

      {ordersError && (
        <p className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          注文データの取得に失敗しました: {ordersError.message}
        </p>
      )}

      <OrdersTable orders={orders ?? []} />
    </div>
  );
}
