import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSmaregiAdapter } from "@/lib/adapters/smaregi";
import type { Order, Product } from "@/lib/types";
import type { CustomerRow } from "@/lib/customers";

/**
 * 決済/受注確定後に共通で行う「会員情報移行」処理(要件定義書 4.3)。
 * - メールアドレスで既存スマレジ会員に名寄せ、なければ新規作成
 * - 注文内容をスマレジ連携アダプタ経由で連携
 * Stripe決済はWebhook確定時、後払い/代引きは基幹システム受理直後に呼び出す。
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", order.customer_id)
    .single();
  if (customerError) throw customerError;

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("id", order.product_id)
    .single();
  if (productError) throw productError;

  const smaregi = getSmaregiAdapter();
  const customerRow = customer as CustomerRow;

  let member = await smaregi.findMemberByEmail(customerRow.email);
  if (!member) {
    member = await smaregi.createMember({
      email: customerRow.email,
      name: customerRow.name,
      phone: customerRow.phone,
      address: customerRow.address,
    });
  }

  if (!customerRow.smaregi_member_id) {
    await supabase
      .from("customers")
      .update({ smaregi_member_id: member.id })
      .eq("id", customerRow.id);
  }

  await smaregi.syncOrder(member.id, {
    order: mapOrderRow(order),
    product: mapProductRow(product),
  });
}

// snake_case のDB行を lib/types.ts のcamelCase型に変換する簡易マッパー
function mapOrderRow(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    productId: row.product_id as string,
    type: row.type as Order["type"],
    paymentMethod: row.payment_method as Order["paymentMethod"],
    amount: row.amount as number,
    shippingFee: row.shipping_fee as number,
    paymentFee: row.payment_fee as number,
    status: row.status as Order["status"],
    stripePaymentIntentId: row.stripe_payment_intent_id as string | null,
    stripeSubscriptionId: row.stripe_subscription_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapProductRow(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    productGroupId: row.product_group_id as string | null,
    name: row.name as string,
    description: row.description as string | null,
    price: row.price as number,
    listPrice: row.list_price as number | null,
    priceLabel: row.price_label as string | null,
    shippingFee: row.shipping_fee as number,
    imageUrl: row.image_url as string | null,
    imageUrls: (row.image_urls as string[] | null) ?? [],
    smaregiProductId: row.smaregi_product_id as string | null,
    orderType: row.order_type as Product["orderType"],
    subscriptionIntervals: row.subscription_intervals as Product["subscriptionIntervals"],
    stripeProductId: row.stripe_product_id as string | null,
    stripePriceId: row.stripe_price_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
