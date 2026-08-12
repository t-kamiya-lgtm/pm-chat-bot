import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

interface OrderRow {
  id: string;
  type: string;
  payment_method: string;
  amount: number;
  created_at: string;
  parent_order_id: string | null;
  products: { name: string; smaregi_product_id: string | null } | null;
  subscriptions: { status: string; next_billing_date: string | null }[] | null;
}

interface CustomerRow {
  id: string;
  customer_number: number;
  name: string;
  smaregi_synced_at: string | null;
  orders: OrderRow[] | null;
}

/** 顧客管理一覧: 注文完了者(customer_number付与済み)を、定期状態・スマレジ連携状態・商品名で絞り込む。 */
export async function getCustomerSummaries(filters: CustomerSummaryFilters): Promise<CustomerSummary[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, customer_number, name, smaregi_synced_at, orders(id, type, payment_method, amount, created_at, parent_order_id, products!orders_product_id_fkey(name, smaregi_product_id), subscriptions(status, next_billing_date))",
    )
    .not("customer_number", "is", null)
    .order("customer_number", { ascending: false });

  if (error) throw new Error(error.message);

  const customers = (data ?? []) as unknown as CustomerRow[];
  const q = filters.q?.trim().toLowerCase() || "";

  const rows = customers.map((customer) => {
    const orders = customer.orders ?? [];
    const subscriptionOrders = orders.filter((o) => o.type === "subscription");
    // 定期の「親」注文(初回)にだけsubscriptionsが紐づく。renewal行はparent_order_idを持つ
    const parentSubscriptionOrder = subscriptionOrders.find((o) => !o.parent_order_id && o.subscriptions?.length);
    const subscriptionStatus: SubscriptionStatusFilter = !parentSubscriptionOrder
      ? "none"
      : parentSubscriptionOrder.subscriptions?.[0]?.status === "canceled"
        ? "canceled"
        : "active";

    const isSmaregiManaged = orders.some((o) => o.payment_method !== "stripe");
    const totalSubscriptionCount = subscriptionOrders.length;
    const totalSubscriptionAmount = subscriptionOrders.reduce((sum, o) => sum + o.amount, 0);
    const latestOrder = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    const searchHaystack = orders
      .map((o) => `${o.products?.name ?? ""} ${o.products?.smaregi_product_id ?? ""}`)
      .join(" ")
      .toLowerCase();

    return {
      summary: {
        id: customer.id,
        customerNumber: customer.customer_number,
        name: customer.name,
        customerType: (isSmaregiManaged ? "スマレジ移行済み" : "チャット内定期") as CustomerSummary["customerType"],
        productName: parentSubscriptionOrder?.products?.name ?? latestOrder?.products?.name ?? null,
        subscriptionStatus,
        totalSubscriptionCount,
        totalSubscriptionAmount,
        nextShippingDate: parentSubscriptionOrder?.subscriptions?.[0]?.next_billing_date ?? null,
      } satisfies CustomerSummary,
      smaregiSynced: Boolean(customer.smaregi_synced_at),
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
