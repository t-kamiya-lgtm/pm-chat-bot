import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { customers, orders, products } from "@/db/schema";
import { readOrderFilters, buildOrderFilterConditions } from "@/lib/order-filters";
import { OrdersTable, type OrderRow } from "@/components/admin/OrdersTable";
import { ShipmentImportForm } from "@/components/admin/ShipmentImportForm";

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

  const db = await getDb();
  const addonProducts = alias(products, "addon_products");
  let orderRows: OrderRow[] = [];
  let ordersError: Error | null = null;
  try {
    const condition = buildOrderFilterConditions(filters);
    const baseQuery = db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: orders.createdAt,
        type: orders.type,
        paymentMethod: orders.paymentMethod,
        amount: orders.amount,
        quantity: orders.quantity,
        shippingFee: orders.shippingFee,
        paymentFee: orders.paymentFee,
        addonAmount: orders.addonAmount,
        discountAmount: orders.discountAmount,
        firstTimeDiscountAmount: orders.firstTimeDiscountAmount,
        status: orders.status,
        deliveryDate: orders.deliveryDate,
        deliveryTimeSlot: orders.deliveryTimeSlot,
        surveyResponses: orders.surveyResponses,
        setSelections: orders.setSelections,
        importStatus: orders.importStatus,
        billingCycleNumber: orders.billingCycleNumber,
        shippedAt: orders.shippedAt,
        carrierName: orders.carrierName,
        trackingNumber: orders.trackingNumber,
        customerName: customers.name,
        customerEmail: customers.email,
        productName: products.name,
        addonProductName: addonProducts.name,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .leftJoin(addonProducts, eq(orders.addonProductId, addonProducts.id))
      .where(condition)
      .orderBy(desc(orders.createdAt));

    const rows = filters.showAll ? await baseQuery : await baseQuery.limit(100);

    orderRows = rows.map((r) => ({
      id: r.id,
      order_number: r.orderNumber,
      created_at: r.createdAt,
      type: r.type,
      payment_method: r.paymentMethod,
      amount: r.amount,
      quantity: r.quantity,
      shipping_fee: r.shippingFee,
      payment_fee: r.paymentFee,
      addon_amount: r.addonAmount,
      discount_amount: r.discountAmount,
      first_time_discount_amount: r.firstTimeDiscountAmount,
      status: r.status,
      delivery_date: r.deliveryDate,
      delivery_time_slot: r.deliveryTimeSlot,
      survey_responses: r.surveyResponses as Record<string, string> | null,
      set_selections: r.setSelections as { id: string; name: string }[] | null,
      import_status: r.importStatus as OrderRow["import_status"],
      billing_cycle_number: r.billingCycleNumber,
      shipped_at: r.shippedAt,
      carrier_name: r.carrierName,
      tracking_number: r.trackingNumber,
      customers: r.customerName !== null ? { name: r.customerName, email: r.customerEmail! } : null,
      products: r.productName !== null ? { name: r.productName } : null,
      addon_products: r.addonProductName !== null ? { name: r.addonProductName } : null,
    }));
  } catch (err) {
    ordersError = err instanceof Error ? err : new Error(String(err));
    console.error("[admin/orders] failed to load orders", ordersError);
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
        <div className="flex items-start gap-2">
          <ShipmentImportForm />
        </div>
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
          <span className="mb-1 block text-xs text-neutral-500">受注ステータス</span>
          <select name="importStatus" defaultValue={filters.importStatus ?? ""} className="input">
            <option value="">すべて</option>
            <option value="imported">取り込み済み</option>
            <option value="on_hold">保留</option>
            <option value="not_imported">未取り込み</option>
            <option value="import_error">取込みエラー</option>
            <option value="excluded">対象外</option>
            <option value="shipped">出荷済</option>
            <option value="canceled">キャンセル</option>
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

      <OrdersTable orders={orderRows} exportQuery={exportQuery.toString()} />
    </div>
  );
}
