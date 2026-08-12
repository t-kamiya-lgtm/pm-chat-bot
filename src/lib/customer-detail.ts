import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { maskEmail, maskPhone, maskAddress } from "@/lib/mask";
import type { Address, ShippingAddress, UserRole } from "@/lib/types";

export interface CustomerDetailOrder {
  id: string;
  order_number: string | null;
  type: string;
  payment_method: string;
  amount: number;
  shipping_fee: number;
  payment_fee: number;
  quantity: number;
  status: string;
  created_at: string;
  delivery_date: string | null;
  delivery_time_slot: string | null;
  shipping_address: ShippingAddress | null;
  survey_responses: Record<string, string> | null;
  parent_order_id: string | null;
  billing_cycle_number: number;
  stripe_subscription_id: string | null;
  products: { name: string } | null;
  subscriptions: { status: string; next_billing_date: string | null; interval: string }[] | null;
}

export interface CustomerDetailResult {
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
}

/**
 * 顧客詳細(プロフィール・購入履歴・アンケート回答)を取得する。
 * staff権限は氏名・注文履歴等は閲覧できるが、電話番号・メールアドレス・詳細住所はマスクする
 * (admin権限のみ、修正作業等に必要なため非マスクの情報を見られる)。
 * 個人情報を含む画面のため、閲覧の都度ログを記録する。
 */
export async function getCustomerDetail(
  customerId: string,
  viewer: { role: UserRole; email: string },
): Promise<CustomerDetailResult | null> {
  const supabase = createSupabaseAdminClient();
  const isAdmin = viewer.role === "admin";

  const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
  if (!customer) return null;

  const { data: orders } = await supabase
    .from("orders")
    .select("*, products!orders_product_id_fkey(name), subscriptions(status, next_billing_date, interval)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  await supabase.from("customer_view_logs").insert({
    customer_id: customerId,
    viewed_by_email: viewer.email,
  });

  const address = customer.address as Address | null;

  return {
    customer: {
      id: customer.id,
      customerNumber: customer.customer_number,
      name: customer.name,
      email: isAdmin ? customer.email : maskEmail(customer.email),
      phone: customer.phone ? (isAdmin ? customer.phone : maskPhone(customer.phone)) : null,
      address: isAdmin ? address : maskAddress(address),
      createdAt: customer.created_at,
      isMasked: !isAdmin,
    },
    orders: (orders ?? []) as unknown as CustomerDetailOrder[],
  };
}
