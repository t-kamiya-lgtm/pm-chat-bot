import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { customers, smaregiSyncLogs } from "@/db/schema";
import type { Db } from "@/lib/db";

export type SubscriptionStatusFilter = "active" | "canceled" | "none";
export type SmaregiFilter = "exclude" | "include" | "only";

export interface CustomerSummaryFilters {
  q?: string;
  subscriptionStatus?: SubscriptionStatusFilter;
  smaregiFilter: SmaregiFilter;
}

export interface CustomerSummary {
  id: string;
  customerNumber: number;
  name: string;
  customerType: "チャット内定期" | "スマレジ移行済み";
  productName: string | null;
  subscriptionStatus: SubscriptionStatusFilter;
  totalSubscriptionCount: number;
  totalSubscriptionAmount: number;
  nextShippingDate: string | null;
}

/** 顧客管理一覧: 注文完了者(customer_number付与済み)を、定期状態・スマレジ連携状態・商品名で絞り込む。 */
export async function getCustomerSummaries(db: Db, filters: CustomerSummaryFilters): Promise<CustomerSummary[]> {
  const customerRows = await db.query.customers.findMany({
    where: isNotNull(customers.customerNumber),
    orderBy: [desc(customers.customerNumber)],
    columns: { id: true, customerNumber: true, name: true, email: true, phone: true },
    with: {
      orders: {
        columns: { id: true, type: true, paymentMethod: true, amount: true, createdAt: true, parentOrderId: true },
        with: {
          product_productId: { columns: { name: true, smaregiProductId: true } },
          subscriptions: { columns: { status: true, nextBillingDate: true } },
        },
      },
    },
  });

  const q = filters.q?.trim().toLowerCase() || "";

  // customers.smaregi_synced_at は連携実装前のプレースホルダーで常にnullのため、
  // 実際にスマレジへ連携済みかどうかは smaregi_sync_logs(status='ok') の実績で判定する。
  const allOrderIds = customerRows.flatMap((c) => c.orders.map((o) => o.id));
  const syncedOrderIds = new Set<string>();
  if (allOrderIds.length > 0) {
    const syncLogs = await db
      .select({ orderId: smaregiSyncLogs.orderId })
      .from(smaregiSyncLogs)
      .where(and(eq(smaregiSyncLogs.status, "ok"), inArray(smaregiSyncLogs.orderId, allOrderIds)));
    for (const log of syncLogs) {
      if (log.orderId) syncedOrderIds.add(log.orderId);
    }
  }

  const rows = customerRows.map((customer) => {
    const orders = customer.orders;
    const subscriptionOrders = orders.filter((o) => o.type === "subscription");
    // 定期の「親」注文(初回)にだけsubscriptionsが紐づく。renewal行はparent_order_idを持つ
    const parentSubscriptionOrder = subscriptionOrders.find((o) => !o.parentOrderId && o.subscriptions.length > 0);
    const subscriptionStatus: SubscriptionStatusFilter = !parentSubscriptionOrder
      ? "none"
      : parentSubscriptionOrder.subscriptions[0]?.status === "canceled"
        ? "canceled"
        : "active";

    const isSmaregiManaged = orders.some((o) => o.paymentMethod !== "stripe");
    const totalSubscriptionCount = subscriptionOrders.length;
    const totalSubscriptionAmount = subscriptionOrders.reduce((sum, o) => sum + o.amount, 0);
    const latestOrder = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const productHaystack = orders
      .map((o) => `${o.product_productId?.name ?? ""} ${o.product_productId?.smaregiProductId ?? ""}`)
      .join(" ");
    const searchHaystack = `${customer.name} ${customer.email ?? ""} ${customer.phone ?? ""} ${productHaystack}`
      .toLowerCase();

    return {
      summary: {
        id: customer.id,
        customerNumber: customer.customerNumber!,
        name: customer.name,
        customerType: (isSmaregiManaged ? "スマレジ移行済み" : "チャット内定期") as CustomerSummary["customerType"],
        productName: parentSubscriptionOrder?.product_productId?.name ?? latestOrder?.product_productId?.name ?? null,
        subscriptionStatus,
        totalSubscriptionCount,
        totalSubscriptionAmount,
        nextShippingDate: parentSubscriptionOrder?.subscriptions[0]?.nextBillingDate ?? null,
      } satisfies CustomerSummary,
      smaregiSynced: orders.some((o) => syncedOrderIds.has(o.id)),
      searchHaystack,
    };
  });

  return rows
    .filter((row) => {
      if (q && !row.searchHaystack.includes(q)) return false;
      if (filters.subscriptionStatus && row.summary.subscriptionStatus !== filters.subscriptionStatus) return false;
      if (filters.smaregiFilter === "exclude" && row.smaregiSynced) return false;
      if (filters.smaregiFilter === "only" && !row.smaregiSynced) return false;
      return true;
    })
    .map((row) => row.summary);
}
