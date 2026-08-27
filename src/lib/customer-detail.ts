import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { maskEmail, maskPhone, maskAddress } from "@/lib/mask";
import { getCustomerChangeLogs, type CustomerChangeLogRow } from "@/lib/customer-change-log";
import { resolveCustomerBrandId } from "@/lib/brand-resolution";
import type { Address, ShippingAddress, UserRole } from "@/lib/types";

export interface CustomerRetentionCampaignType {
  id: string;
  title: string;
  description: string | null;
}

export interface CustomerRetentionAction {
  id: string;
  campaignTypeId: string;
  campaignTitle: string;
  performedMonth: string;
  subscriptionId: string | null;
  detail: string | null;
  createdAt: string;
}

export interface CustomerDetailSubscriptionItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_amount: number;
  added_at: string;
  products: { name: string; smaregi_product_id: string | null } | null;
}

export interface CustomerDetailSubscription {
  id: string;
  status: string;
  next_billing_date: string | null;
  interval: string;
  override_product_id: string | null;
  override_quantity: number | null;
  override_amount: number | null;
  override_payment_method: string | null;
  override_product: { name: string; smaregi_product_id: string | null } | null;
  items: CustomerDetailSubscriptionItem[];
}

export interface CustomerDetailOrder {
  id: string;
  order_number: string | null;
  type: string;
  payment_method: string;
  amount: number;
  addon_amount: number | null;
  discount_amount: number | null;
  first_time_discount_amount: number | null;
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
  subscription_item_id: string | null;
  stripe_subscription_id: string | null;
  products: { name: string; smaregi_product_id: string | null } | null;
  subscriptions: CustomerDetailSubscription[] | null;
}

export interface CustomerDetailResult {
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
  /**
   * 継続期間 = 定期初回注文からの経過月 - 休止月(概算、月単位)。
   * 休止月は、変更履歴上の解約〜再開(または解約中のまま現在まで)の期間を定期ごとに合算したもの。
   * 定期購入がなければnull。
   */
  tenureMonths: number | null;
  /** 顧客の直近の注文から推定したブランド。継続施策タイトルの選択肢を絞り込むために使う。 */
  brandId: string | null;
  /** ブランドに登録されている継続施策タイトルの選択肢(顧客管理画面⑥の入力フォーム用)。 */
  availableCampaignTypes: CustomerRetentionCampaignType[];
  /** この顧客に記録済みの継続施策ログ。 */
  retentionActions: CustomerRetentionAction[];
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30;

/** 特定の定期購入について、解約〜再開(または解約中のまま現在まで)の期間の合計(ミリ秒)を求める。 */
function calculatePausedMs(subscriptionId: string, changeLogs: CustomerChangeLogRow[], now: number): number {
  const events = changeLogs
    .filter((l) => l.subscription_id === subscriptionId && (l.action === "subscription_cancel" || l.action === "subscription_resume"))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let pausedMs = 0;
  let pauseStartedAt: number | null = null;
  for (const event of events) {
    const timestamp = new Date(event.created_at).getTime();
    if (event.action === "subscription_cancel" && pauseStartedAt === null) {
      pauseStartedAt = timestamp;
    } else if (event.action === "subscription_resume" && pauseStartedAt !== null) {
      pausedMs += timestamp - pauseStartedAt;
      pauseStartedAt = null;
    }
  }
  if (pauseStartedAt !== null) {
    pausedMs += now - pauseStartedAt;
  }
  return pausedMs;
}

/**
 * 顧客詳細(プロフィール・定期便申込内容・購入履歴・変更履歴)を取得する。
 * staff権限は氏名・注文履歴等は閲覧できるが、電話番号・メールアドレス・詳細住所・変更履歴の
 * 個人情報部分はマスクする(admin権限のみ、修正作業等に必要なため非マスクの情報を見られる)。
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
    .select(
      `*, products!orders_product_id_fkey(name, smaregi_product_id),
       subscriptions(
         id, status, next_billing_date, interval,
         override_product_id, override_quantity, override_amount, override_payment_method,
         override_product:products!subscriptions_override_product_id_fkey(name, smaregi_product_id),
         subscription_items(id, product_id, quantity, unit_amount, added_at, removed_at, products(name, smaregi_product_id))
       )`,
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  await supabase.from("customer_view_logs").insert({
    customer_id: customerId,
    viewed_by_email: viewer.email,
  });

  const changeLogs = await getCustomerChangeLogs(supabase, customerId, isAdmin);

  const rows = (orders ?? []) as unknown as (CustomerDetailOrder & {
    subscriptions: (CustomerDetailSubscription & { subscription_items: (CustomerDetailSubscriptionItem & { removed_at: string | null })[] })[] | null;
  })[];

  for (const row of rows) {
    if (row.subscriptions) {
      for (const sub of row.subscriptions) {
        sub.items = (sub as unknown as { subscription_items: (CustomerDetailSubscriptionItem & { removed_at: string | null })[] }).subscription_items.filter(
          (item) => !item.removed_at,
        );
      }
    }
  }

  const subscriptionRootOrders = rows.filter((o) => o.type === "subscription" && !o.parent_order_id);
  let tenureMonths: number | null = null;
  if (subscriptionRootOrders.length > 0) {
    const now = Date.now();
    const baseTimestamp = Math.min(...subscriptionRootOrders.map((o) => new Date(o.created_at).getTime()));
    const pausedMs = subscriptionRootOrders.reduce((sum, o) => {
      const subscriptionId = o.subscriptions?.[0]?.id;
      return subscriptionId ? sum + calculatePausedMs(subscriptionId, changeLogs, now) : sum;
    }, 0);
    tenureMonths = Math.max(0, Math.floor((now - baseTimestamp - pausedMs) / MS_PER_MONTH));
  }

  const address = customer.address as Address | null;

  const brandId = await resolveCustomerBrandId(supabase, customerId);

  const availableCampaignTypes: CustomerRetentionCampaignType[] = [];
  if (brandId) {
    const { data: campaignTypes } = await supabase
      .from("retention_campaign_types")
      .select("id, title, description")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: true });
    availableCampaignTypes.push(...((campaignTypes ?? []) as CustomerRetentionCampaignType[]));
  }

  const { data: retentionActionRows } = await supabase
    .from("customer_retention_actions")
    .select("id, campaign_type_id, performed_month, subscription_id, detail, created_at, retention_campaign_types(title)")
    .eq("customer_id", customerId)
    .order("performed_month", { ascending: false });

  const retentionActions: CustomerRetentionAction[] = ((retentionActionRows ?? []) as unknown as {
    id: string;
    campaign_type_id: string;
    performed_month: string;
    subscription_id: string | null;
    detail: string | null;
    created_at: string;
    retention_campaign_types: { title: string } | null;
  }[]).map((row) => ({
    id: row.id,
    campaignTypeId: row.campaign_type_id,
    campaignTitle: row.retention_campaign_types?.title ?? "(削除された施策)",
    performedMonth: row.performed_month,
    subscriptionId: row.subscription_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));

  return {
    customer: {
      id: customer.id,
      customerNumber: customer.customer_number,
      name: customer.name,
      nameKana: customer.name_kana,
      email: isAdmin ? customer.email : maskEmail(customer.email),
      phone: customer.phone ? (isAdmin ? customer.phone : maskPhone(customer.phone)) : null,
      address: isAdmin ? address : maskAddress(address),
      createdAt: customer.created_at,
      isMasked: !isAdmin,
    },
    orders: rows,
    changeLogs,
    tenureMonths,
    brandId,
    availableCampaignTypes,
    retentionActions,
  };
}
