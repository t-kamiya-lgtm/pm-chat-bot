import { smaregiWrite } from "@/lib/adapters/smaregi-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Address, ShippingAddress } from "@/lib/types";

/**
 * 代引き・後払いの注文を、スマレジEC・リピートの受注APIへ連携する。
 * customer_id: -1(名寄せ・新規会員作成)を指定する。パスワード未設定の本会員が自動作成されるが、
 * 顧客マスタにも反映させたいという要望のためこちらを採用する(顧客管理はチャットシステム側で行うため、
 * スマレジ側のログイン可否は運用上問題としない)。
 * 定期便の2回目以降は、スマレジのperiodical_order(自動継続)機能を使わず、当システム側
 * (subscription-renewal.tsのcreateDeferredSubscriptionRenewalOrder)が毎回新しい注文データを
 * 生成してこの関数を呼ぶため、この関数自体は常に単発の受注として送るだけでよい
 * (periodical_orderは初回受注データを2回目以降もそのままコピーする仕組みのため、
 * 初回特別価格・クーポン等の値引きが2回目以降にも残ってしまう問題があった)。
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

  // クロスセル(アドオン)商品。定期の有無に関わらず、常に単発の追加購入品として1明細追加する。
  let addonProduct: Record<string, unknown> | null = null;
  if (order.addon_product_id) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", order.addon_product_id)
      .maybeSingle();
    if (error) throw error;
    addonProduct = data;
  }

  const isSubscription = order.type === "subscription";

  const address = customer.address as Address | null;
  const shippingAddress = order.shipping_address as ShippingAddress | null;

  const quantity = order.quantity as number;
  const unitPrice = product.price as number;
  const productTotal = unitPrice * quantity;
  const taxRate = (product.tax_rate as number) ?? 8;

  // discount/other_discount/coupon_totalの各フィールドを使って値引きを表現する方法は、
  // 実際の送信内容と結果を何パターンも突き合わせても請求額[payment_total]の整合性チェックに
  // 通らないことが判明した(coupon_totalは金額を直接指定できる項目ではなく、スマレジ側に
  // 事前登録されたクーポンマスタへの参照が必要な項目である可能性が高い)。
  // そのため、初回特別価格・クーポンを問わずすべての値引きを商品単価そのものに反映し、
  // discount系フィールドは使わない(実際に正常処理された注文はすべてdiscount=0だったため、
  // この構造に合わせる)。割引はメイン商品の明細にのみ適用する(アドオンは定価のまま)。
  // 定期便は2回目以降がスマレジ側で自動生成されるため、この値引きは初回注文のみに適用される。
  const otherDiscount = (order.first_time_discount_amount as number | null) ?? 0;
  const couponDiscount = (order.discount_amount as number) ?? 0;
  const totalDiscount = otherDiscount + couponDiscount;
  const discountedProductTotal = Math.max(0, productTotal - totalDiscount);
  const discountedUnitPrice = quantity > 0 ? Math.round(discountedProductTotal / quantity) : discountedProductTotal;
  const productTax = calcTax(discountedProductTotal, taxRate);

  // アドオン金額は order.addon_amount(注文時点の価格)を正とする。
  const addonAmount = addonProduct ? ((order.addon_amount as number | null) ?? 0) : 0;
  const addonTaxRate = addonProduct ? ((addonProduct.tax_rate as number) ?? 8) : 8;
  const addonTax = addonProduct ? calcTax(addonAmount, addonTaxRate) : 0;

  const shippingFee = order.shipping_fee as number;
  const paymentFee = order.payment_fee as number;
  const subtotal = discountedProductTotal + addonAmount;
  const totalTax = productTax + addonTax;
  const total = Math.max(0, subtotal + shippingFee + paymentFee);

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
      // 値引きは商品単価側に反映済みのため、調整額・クーポン利用・ポイント利用はすべて0。
      discount: 0,
      other_discount: 0,
      total,
      deliv_fee: shippingFee,
      charge: paymentFee,
      tax: totalTax,
      payment_total: total,
      coupon_total: 0,
      use_point: 0,
      // 受注登録時点ではまだ入金(代引きの集金・後払いの支払い)が完了していないため0。
      // 必須項目のため明示的に指定する(未指定だとAPIに拒否される)。
      payment_amount_total: 0,
      total_notax: total - totalTax,
      total_tax: totalTax,
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
      // 配送区分(必須項目)。実際に処理された受注データを調査した結果、通常の商品配送は"0"だった。
      hasso_deliv_kbn: "0",
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
        // ご購入明細区分(必須項目)。実際に処理された受注データを調査した結果、
        // 定期・単品にかかわらず商品明細行はすべて"商品"だった(product_reg_flagとは別項目)。
        detail_kbn: "商品",
        product_code: (product.smaregi_product_id as string | null) ?? product.id,
        product_name: product.name,
        product_quantity: quantity,
        product_tax_flag: "込",
        tax_rule: 2,
        product_postage_flag: "込",
        product_daibiki_flag: "込",
        product_price: discountedUnitPrice,
        product_total: discountedProductTotal,
        tax_rate: taxRate,
        product_tax: productTax,
        product_reg_flag: isSubscription ? "定期" : "商品",
      },
      ...(addonProduct
        ? [
            {
              detail_kbn: "商品",
              product_code: (addonProduct.smaregi_product_id as string | null) ?? (addonProduct.id as string),
              product_name: addonProduct.name as string,
              product_quantity: 1,
              product_tax_flag: "込",
              tax_rule: 2,
              product_postage_flag: "込",
              product_daibiki_flag: "込",
              product_price: addonAmount,
              product_total: addonAmount,
              tax_rate: addonTaxRate,
              product_tax: addonTax,
              // アドオン自体もメインと同じ周期の定期便として同時申込された場合は、
              // 同じperiodical_order(注文単位で1つ)に一緒に乗る「定期」明細として扱う。
              product_reg_flag: order.is_addon_subscription ? "定期" : "商品",
            },
          ]
        : []),
    ],
  };

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
