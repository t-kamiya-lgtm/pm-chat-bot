import { smaregiWrite } from "@/lib/adapters/smaregi-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import type { Address, ShippingAddress, SubscriptionInterval } from "@/lib/types";

/**
 * 代引き・後払いの注文を、スマレジEC・リピートの受注APIへ連携する。
 * customer_id: -1 を指定することでメールアドレスによる名寄せ・新規顧客作成をスマレジ側に任せられるため、
 * 顧客APIの事前呼び出しは不要。定期の場合はperiodical_orderを同時に埋め込み、1回のAPI呼び出しで
 * 受注データと定期申込データを同時作成する(受注APIドキュメント記載の仕様)。
 *
 * 以下はスマレジ側マスタ設定に基づく固定値(2026年時点でヒアリング済み):
 * - ec_type: 16 (スマレジEC・リピート)
 * - order_root: 3 (このチャットボット用に用意された販路区分)
 * - payment_id: 代引き=4、後払い単品=44、後払い定期=98
 * - deliv_id: ポスト投函=5、通常配送=27
 * - tax_calc_type: 明細単位、tax_rule: 2(切り捨て)
 * - 商品価格は税込表示のため、product_tax_flag等はすべて"込"
 */

const EC_TYPE = "16";
const ORDER_ROOT = "3";
const DELIV_ID_MAIL = "5";
const DELIV_ID_NORMAL = "27";
const PAYMENT_ID_COD = "4";
const PAYMENT_ID_DEFERRED_ONE_TIME = "44";
const PAYMENT_ID_DEFERRED_SUBSCRIPTION = "98";

function formatAddressLine(address: { city?: string | null; line1?: string | null } | null): string {
  if (!address) return "";
  return `${address.city ?? ""}${address.line1 ?? ""}`;
}

/** 税込価格から消費税額を算出する(tax_rule=2: 切り捨て)。 */
function calcTax(priceInclTax: number, taxRatePercent: number): number {
  return Math.floor(priceInclTax - priceInclTax / (1 + taxRatePercent / 100));
}

function toDateString(iso: string): string {
  return iso.slice(0, 10);
}

/** 代引き・後払いの注文をスマレジ受注APIへ連携する。Stripe決済の注文には使わない。 */
export async function syncOrderToSmaregi(orderId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: order, error: orderError } = await supabase.from("orders").select("*").eq("id", orderId).single();
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

  const isSubscription = order.type === "subscription";
  let subscriptionRow: { interval: SubscriptionInterval; next_billing_date: string | null } | null = null;
  if (isSubscription) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("interval, next_billing_date")
      .eq("order_id", orderId)
      .single();
    if (error) throw error;
    subscriptionRow = data;
  }

  const address = customer.address as Address | null;
  const shippingAddress = order.shipping_address as ShippingAddress | null;

  const quantity = order.quantity as number;
  const unitPrice = product.price as number;
  const productTotal = unitPrice * quantity;
  const taxRate = (product.tax_rate as number) ?? 8;
  const productTax = calcTax(productTotal, taxRate);

  const shippingFee = order.shipping_fee as number;
  const paymentFee = order.payment_fee as number;
  const discount = (order.discount_amount as number) ?? 0;
  const subtotal = productTotal;
  const total = Math.max(0, subtotal - discount + shippingFee + paymentFee);

  const paymentId =
    order.payment_method === "cod"
      ? PAYMENT_ID_COD
      : isSubscription
        ? PAYMENT_ID_DEFERRED_SUBSCRIPTION
        : PAYMENT_ID_DEFERRED_ONE_TIME;
  const delivId = product.is_mail_deliverable ? DELIV_ID_MAIL : DELIV_ID_NORMAL;

  const record: Record<string, unknown> = {
    "order.customer_id": -1,
    "order.order_name01": customer.name,
    "order.order_email": customer.email,
    "order.order_email_type": "1",
    "order.order_tel": customer.phone ?? "",
    "order.order_zip": address?.postalCode ?? "",
    "order.order_pref": address?.prefecture ?? "",
    "order.order_addr01": formatAddressLine(address),
    "order.order_addr02": address?.line2 ?? "",
    "order.subtotal": subtotal,
    "order.discount": discount,
    "order.total": total,
    "order.deliv_fee": shippingFee,
    "order.charge": paymentFee,
    "order.tax": productTax,
    "order.payment_total": total,
    "order.total_notax": subtotal - productTax,
    "order.total_tax": productTax,
    "order.deliv_fee_notax": shippingFee,
    "order.charge_notax": paymentFee,
    "order.ec_type": EC_TYPE,
    "order.ec_order_id": order.id,
    "order.ec_order_id_branch": 0,
    "order.order_root": ORDER_ROOT,
    "order.order_status": "1",
    "order.payment_id": paymentId,
    "order.payment_status": "0",
    "order.deliv_id": delivId,
    "order.reserve_type": isSubscription ? "3" : "0",
    "order.order_date": (order.created_at as string).replace("T", " ").slice(0, 19),

    "shipping.shipping_name01": shippingAddress?.recipientName ?? customer.name,
    "shipping.shipping_tel": shippingAddress?.recipientPhone ?? customer.phone ?? "",
    "shipping.shipping_zip": shippingAddress?.postalCode ?? address?.postalCode ?? "",
    "shipping.shipping_pref": shippingAddress?.prefecture ?? address?.prefecture ?? "",
    "shipping.shipping_addr01": formatAddressLine(shippingAddress ?? address),
    "shipping.shipping_addr02": shippingAddress?.line2 ?? address?.line2 ?? "",

    "order_detail.product_code": (product.smaregi_product_id as string | null) ?? product.id,
    "order_detail.product_name": product.name,
    "order_detail.detail_kbn": "通常",
    "order_detail.product_quantity": quantity,
    "order_detail.product_tax_flag": "込",
    "order_detail.tax_rule": 2,
    "order_detail.product_postage_flag": "込",
    "order_detail.product_daibiki_flag": "込",
    "order_detail.product_price": unitPrice,
    "order_detail.product_total": productTotal,
    "order_detail.tax_rate": taxRate,
    "order_detail.product_tax": productTax,
    "order_detail.product_reg_flag": isSubscription ? "定期" : "商品",
  };

  if (isSubscription && subscriptionRow) {
    const periodDay = SUBSCRIPTION_INTERVAL_DAYS[subscriptionRow.interval];
    const nextPeriod = subscriptionRow.next_billing_date ?? toDateString(order.created_at as string);
    Object.assign(record, {
      "periodical_order.periodical_order_id": -1,
      "periodical_order.ec_periodical_order_id": order.id,
      "periodical_order.customer_id": -1,
      "periodical_order.total_periodical_times": 1,
      "periodical_order.order_name01": customer.name,
      "periodical_order.order_email": customer.email,
      "periodical_order.order_tel": customer.phone ?? "",
      "periodical_order.order_zip": address?.postalCode ?? "",
      "periodical_order.order_pref": address?.prefecture ?? "",
      "periodical_order.order_addr01": formatAddressLine(address),
      "periodical_order.order_addr02": address?.line2 ?? "",
      "periodical_order.subtotal": subtotal,
      "periodical_order.discount": discount,
      "periodical_order.deliv_id": delivId,
      "periodical_order.deliv_fee": shippingFee,
      "periodical_order.charge": paymentFee,
      "periodical_order.use_point_flg": "0",
      "periodical_order.tax": productTax,
      "periodical_order.payment_total": total,
      "periodical_order.payment_id": paymentId,
      "periodical_order.total": total,
      "periodical_order.total_notax": subtotal - productTax,
      "periodical_order.total_tax": productTax,
      "periodical_order.deliv_fee_notax": shippingFee,
      "periodical_order.charge_notax": paymentFee,
      "periodical_order.period_type": "date",
      "periodical_order.period_day": periodDay,
      "periodical_order.next_period": nextPeriod,
      "periodical_order.real_next_period": nextPeriod,
      "periodical_order.periodical_status": "0",
      "periodical_order.application_date": toDateString(order.created_at as string),
      "periodical_order.order_root": ORDER_ROOT,
      "periodical_order.ec_periodical_order_id_branch": 0,
    });
  }

  try {
    const response = await smaregiWrite("/api/v2/orders/create", "orders", [record]);
    await supabase.from("smaregi_sync_logs").insert({
      order_id: orderId,
      payload: { request: record, response },
      status: "ok",
    });
  } catch (err) {
    await supabase.from("smaregi_sync_logs").insert({
      order_id: orderId,
      payload: { request: record },
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
