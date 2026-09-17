import { smaregiWrite } from "@/lib/adapters/smaregi-client";

/**
 * スマレジEC・リピートAPI v2の受注API(/api/v2/orders)・定期申込API(/api/v2/periodical_orders)。
 *
 * 【重要な設計方針(new-chatbotリポジトリのdocs/smaregi-cart-handoff-research.md 4.6〜4.7参照)】
 * - `customer_id: -1` を指定すると、メールアドレス一致による自動名寄せで顧客を検索し、
 *   一致する顧客がいなければ新規作成する(実機検証+API仕様書の両方で確認済み)。
 *   本モジュールはこれを前提に、常に`customer_id: -1`を送る({@link createOrder}参照)。
 * - カード決済(Stripe)の場合、2回目以降の請求はStripe Billingが担うため、
 *   ここでの`periodicalOrder`は**代引き・後払いの場合のみ**指定する
 *   (カードの定期購入では、smaregi純正の定期申込機構は使わない)。
 * - `payment_status`(決済済みに相当する値)・カード決済時の`payment_id`の実際の値は
 *   本番の`debug-orders`エンドポイントでの確認が必要(未確定のままプレースホルダを残している)。
 */

export interface OrdererInfo {
  email: string;
  lastName: string;
  firstName?: string;
  lastNameKana?: string;
  firstNameKana?: string;
  tel: string;
  zip: string;
  pref: string;
  addr01: string;
  addr02?: string;
  /** 1:男性 2:女性 等、マスタの値と一致させる必要がある(customer.sexのマスタ変換に準拠) */
  sexId?: number;
}

export interface ShippingInfo {
  lastName: string;
  firstName?: string;
  tel: string;
  zip: string;
  pref: string;
  addr01: string;
  addr02?: string;
}

export interface OrderDetailInput {
  productCode: string;
  productName: string;
  quantity: number;
  /** 税込単価。税別で管理する場合はpriceNotaxを使う(taxFlagで指定した方を必須とする) */
  priceIntax?: number;
  priceNotax?: number;
  /** "別" | "込" */
  taxFlag: "別" | "込";
  taxRate: number;
  tax: number;
  total: number;
  /** "定期" | "商品" */
  productRegFlag: "定期" | "商品";
}

export interface PeriodicalOrderCreateInput {
  /** 定期受注周期タイプ */
  periodType: "date" | "monthly_date" | "monthly_day" | "weekly" | "biweekly";
  /** period_typeが"date"の場合の間隔日数 */
  periodDay?: number;
  nextPeriod: string; // YYYY-MM-DD
  details: Array<{
    productCode: string;
    quantity: number;
    taxFlag: "別" | "込";
    taxRule: 1 | 2 | 3;
    /** 初回税込/税抜価格(taxFlagに応じてどちらかを指定) */
    firstPriceIntax?: number;
    firstPriceNotax?: number;
    firstTaxRate: number;
    /** 2回目以降の税込/税抜価格。初回特別価格と通常価格を分離できるのが本方式の要(4.6.3) */
    secondPriceIntax?: number;
    secondPriceNotax?: number;
    secondTaxRate: number;
  }>;
}

export interface CreateOrderInput {
  /** チャット側で採番したEC注文番号(重複更新のキーになるため一意性が必須) */
  ecOrderId: string;
  ecShopId?: number;
  ecType: string;
  orderer: OrdererInfo;
  shipping: ShippingInfo;
  details: OrderDetailInput[];
  subtotal: number;
  total: number;
  totalNotax: number;
  totalTax: number;
  tax: number;
  delivFee: number;
  delivFeeNotax: number;
  charge: number;
  chargeNotax: number;
  paymentTotal: number;
  /** 支払方法ID(payment_id)。旧実装の実績値: 代引き=4, 後払い単品=44, 後払い定期=98, カード=77。
   *  実際にprimedirect.jp契約側で有効な値は要確認(4.6.2・5.5参照)。 */
  paymentId: number;
  delivId: number;
  orderRoot: number;
  /** マスタの名称と一致させる必要がある(要確認) */
  orderStatus: string;
  hassoDelivKbn: string;
  /** "0":単発 "3":定期 (旧smaregi-order-sync.tsでの実績値) */
  reserveType: "0" | "3";
  /** 決済済みを表す値は未確定。確定するまで呼び出し側で明示的に渡す想定 */
  paymentStatus: number;
  /** 代引き・後払いの定期のみ指定する(カードの定期はStripe Billingに任せるため指定しない) */
  periodicalOrder?: PeriodicalOrderCreateInput;
}

function toOrderDetailPayload(detail: OrderDetailInput) {
  return {
    product_code: detail.productCode,
    product_name: detail.productName,
    product_quantity: detail.quantity,
    product_price_intax: detail.priceIntax,
    product_price_notax: detail.priceNotax,
    product_tax_flag: detail.taxFlag,
    tax_rule: 1,
    product_tax: detail.tax,
    tax_rate: detail.taxRate,
    product_total: detail.total,
    product_postage_flag: "込",
    product_daibiki_flag: "込",
    product_reg_flag: detail.productRegFlag,
  };
}

function toPeriodicalOrderPayload(input: PeriodicalOrderCreateInput) {
  return {
    periodical_order_id: -1,
    period_type: input.periodType,
    period_day: input.periodDay,
    next_period: input.nextPeriod,
    periodical_order_detail: input.details.map((d) => ({
      product_code: d.productCode,
      quantity: d.quantity,
      tax_flag: d.taxFlag,
      tax_rule: d.taxRule,
      first_price_intax: d.firstPriceIntax,
      first_price_notax: d.firstPriceNotax,
      first_tax_rate: d.firstTaxRate,
      second_price_intax: d.secondPriceIntax,
      second_price_notax: d.secondPriceNotax,
      second_tax_rate: d.secondTaxRate,
    })),
  };
}

/**
 * 受注データを作成する。`customer_id: -1`を常に指定し、メールアドレスによる自動名寄せ
 * (既存顧客への統合、または新規顧客作成)をスマレジ側に任せる。
 *
 * レスポンスに解決後の`customer_id`(自動名寄せの結果、新規作成 or 既存顧客のいずれか)が
 * 含まれるかどうかは一次情報のサンプルレスポンスだけでは断定できていないため、
 * 呼び出し側で新規顧客かどうかを判定したい場合は、本関数の呼び出し前に
 * {@link findCustomerByEmail}(smaregi-customer-api.ts)で既存有無を確認しておくこと。
 */
export async function createOrder(input: CreateOrderInput): Promise<unknown> {
  const payload: Record<string, unknown> = {
    order: {
      customer_id: -1,
      order_name01: input.orderer.lastName,
      order_name02: input.orderer.firstName,
      order_kana01: input.orderer.lastNameKana,
      order_kana02: input.orderer.firstNameKana,
      order_email: input.orderer.email,
      order_email_type: 1,
      order_tel: input.orderer.tel,
      order_zip: input.orderer.zip,
      order_pref: input.orderer.pref,
      order_addr01: input.orderer.addr01,
      order_addr02: input.orderer.addr02,
      order_sex: input.orderer.sexId,
      subtotal: input.subtotal,
      total: input.total,
      total_notax: input.totalNotax,
      total_tax: input.totalTax,
      tax: input.tax,
      deliv_fee: input.delivFee,
      deliv_fee_notax: input.delivFeeNotax,
      charge: input.charge,
      charge_notax: input.chargeNotax,
      payment_total: input.paymentTotal,
      payment_id: input.paymentId,
      deliv_id: input.delivId,
      order_root: input.orderRoot,
      order_status: input.orderStatus,
      hasso_deliv_kbn: input.hassoDelivKbn,
      reserve_type: input.reserveType,
      payment_status: input.paymentStatus,
      ec_type: input.ecType,
      ec_order_id: input.ecOrderId,
      ec_order_id_branch: 0,
      ec_shop_id: input.ecShopId ?? 1000,
    },
    shipping: {
      shipping_name01: input.shipping.lastName,
      shipping_name02: input.shipping.firstName,
      shipping_tel: input.shipping.tel,
      shipping_zip: input.shipping.zip,
      shipping_pref: input.shipping.pref,
      shipping_addr01: input.shipping.addr01,
      shipping_addr02: input.shipping.addr02,
    },
    order_detail: input.details.map(toOrderDetailPayload),
  };

  if (input.periodicalOrder) {
    payload.periodical_order = toPeriodicalOrderPayload(input.periodicalOrder);
  }

  return smaregiWrite("/api/v2/orders/create", "orders", [payload]);
}
