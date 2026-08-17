import { smaregiWrite } from "@/lib/adapters/smaregi-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SUBSCRIPTION_INTERVAL_DAYS } from "@/lib/subscription-intervals";
import type { Address, ShippingAddress, SubscriptionInterval } from "@/lib/types";

/**
 * 代引き・後払いの注文を、スマレジEC・リピートの受注APIへ連携する。
 * customer_id: -1(名寄せ・新規会員作成)を指定する。パスワード未設定の本会員が自動作成されるが、
 * 顧客マスタにも反映させたいという要望のためこちらを採用する(顧客管理はチャットシステム側で行うため、
 * スマレジ側のログイン可否は運用上問題としない)。定期の場合はperiodical_orderを同時に埋め込み、
 * 1回のAPI呼び出しで受注データと定期申込データを同時作成する(受注APIドキュメント記載の仕様)。
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

/** DB保存(UTC)の日時を日本時間(JST, UTC+9)の"YYYY-MM-DD HH:mm:ss"形式に変換する。 */
function toJstDateTime(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace("T", " ").slice(0, 19);
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
    order: {
      customer_id: -1,
      order_name01: customer.name,
      order_email: customer.email,
      order_email_type: "1",
      order_tel: customer.phone ?? "",
      order_zip: address?.postalCode ?? "",
      order_pref: address?.prefecture ?? "",
      order_addr01: formatAddressLine(address),
      order_addr02: address?.line2 ?? "",
      subtotal,
      discount,
      total,
      deliv_fee: shippingFee,
      charge: paymentFee,
      tax: productTax,
      payment_total: total,
      total_notax: subtotal - productTax,
      total_tax: productTax,
      deliv_fee_notax: shippingFee,
      charge_notax: paymentFee,
      ec_type: EC_TYPE,
      ec_order_id: order.id,
      ec_order_id_branch: 0,
      order_root: ORDER_ROOT,
      order_status: "1",
      payment_id: paymentId,
      payment_status: "0",
      deliv_id: delivId,
      reserve_type: isSubscription ? "3" : "0",
      order_date: toJstDateTime(order.created_at as string),
      tax_calc_type: "明細単位",
    },
    shipping: {
      shipping_name01: shippingAddress?.recipientName ?? customer.name,
      shipping_tel: shippingAddress?.recipientPhone ?? customer.phone ?? "",
      shipping_zip: shippingAddress?.postalCode ?? address?.postalCode ?? "",
      shipping_pref: shippingAddress?.prefecture ?? address?.prefecture ?? "",
      shipping_addr01: formatAddressLine(shippingAddress ?? address),
      shipping_addr02: shippingAddress?.line2 ?? address?.line2 ?? "",
    },
    order_detail: [
      {
        product_code: (product.smaregi_product_id as string | null) ?? product.id,
        product_name: product.name,
        product_quantity: quantity,
        product_tax_flag: "込",
        tax_rule: 2,
        product_postage_flag: "込",
        product_daibiki_flag: "込",
        product_price: unitPrice,
        product_total: productTotal,
        tax_rate: taxRate,
        product_tax: productTax,
        product_reg_flag: isSubscription ? "定期" : "商品",
      },
    ],
  };

  if (isSubscription && subscriptionRow) {
    const periodDay = SUBSCRIPTION_INTERVAL_DAYS[subscriptionRow.interval];
    const nextPeriod = subscriptionRow.next_billing_date ?? toDateString(order.created_at as string);
    // order/create に periodical_order を埋め込む場合、顧客・金額・住所等はorder側の値がそのまま
    // 使われるため指定できない(指定するとエラーになる)。周期情報のみを指定する。
    record.periodical_order = {
      periodical_order_id: -1,
      period_type: "date",
      period_day: periodDay,
      next_period: nextPeriod,
    };
  }

  try {
    const response = await smaregiWrite<{ orders: { id: string | null; result: number; log_info?: string }[] }>(
      "/api/v2/orders/create",
      "orders",
      [record],
    );
    const result = response.orders?.[0];
    if (!result || !result.id) {
      throw new Error(`smaregi order create rejected: ${result?.log_info ?? JSON.stringify(response)}`);
    }
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
