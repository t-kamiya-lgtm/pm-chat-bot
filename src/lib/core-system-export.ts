import type { Address, ShippingAddress } from "@/lib/types";

/**
 * 通販ゲート受注データ取込フォーマット(59項目)向けの固定値・変換ロジック。
 * 「通販ゲート取込用CSV出力」(Stripe決済のみ)と、全決済方法を含む「全データCSV出力」の
 * どちらもこのフォーマット(59列)で出力する。後払い・代引きはスマレジ側で完結しており
 * 通販ゲートへの取込対象ではないため、対応するデータがない項目は空欄で出力する。
 */

/** 決済方法(column 28)。Stripe以外は通販ゲート側の対応コードが定義されていないため空欄とする。 */
export const CORE_SYSTEM_PAYMENT_METHOD_LABEL = "77 ストライプ決済";

/** 決済方法(column 28)の値を、注文の決済方法から解決する。 */
export function resolveCoreSystemPaymentMethodLabel(paymentMethod: string): string {
  return paymentMethod === "stripe" ? CORE_SYSTEM_PAYMENT_METHOD_LABEL : "";
}

/** 媒体CD(column 55)。チャットボット(PDchatbot)用に発行された値。 */
export const CORE_SYSTEM_MEDIA_CODE = "5003";

/** 配送方法(column 35)、通常配送の固定値。 */
export const CORE_SYSTEM_SHIPPING_METHOD_LABEL = "宅急便";

/** 配送方法(column 35)、メール便(ポスト投函)の固定値。 */
export const CORE_SYSTEM_MAIL_SHIPPING_METHOD_LABEL = "郵メール";

/** 注文者顧客区分(column 17)は固定値。 */
export const CORE_SYSTEM_CUSTOMER_CATEGORY = "1";

/** 受付CD(column 54)は固定値。 */
export const CORE_SYSTEM_RECEPTION_CD = "4";

/** 性別(column 13)が未収集の場合のデフォルト値。 */
export const CORE_SYSTEM_GENDER_FALLBACK = "不明";

/**
 * 配送方法(column 35)を決める。決済フォームの「ポスト投函」制限
 * (単品1点のみ・アドオンなしの場合に限りメール便対象)と同じ条件を使う。
 */
export function resolveShippingMethodLabel(params: {
  isMailDeliverable: boolean;
  quantity: number;
  hasAddon: boolean;
}): string {
  const isMailEligible = params.isMailDeliverable && params.quantity === 1 && !params.hasAddon;
  return isMailEligible ? CORE_SYSTEM_MAIL_SHIPPING_METHOD_LABEL : CORE_SYSTEM_SHIPPING_METHOD_LABEL;
}

/** 配送時間(column 38)。チャットボットの選択肢文言を、通販ゲートの表記(半角ハイフン区切り)へ変換する。 */
const CORE_SYSTEM_DELIVERY_TIME_SLOT_MAP: Record<string, string> = {
  "午前中": "午前中",
  "12〜14時": "12:00-14:00",
  "14〜16時": "14:00-16:00",
  "16〜18時": "16:00-18:00",
  "18〜20時": "18:00-20:00",
  "19〜21時": "19:00-21:00",
};

export function toCoreSystemDeliveryTimeSlot(slot: string | null): string {
  if (!slot) return "";
  return CORE_SYSTEM_DELIVERY_TIME_SLOT_MAP[slot] ?? "";
}

const FULLWIDTH_DIGITS = "０-９";
const DIGIT_CLASS = `0-9${FULLWIDTH_DIGITS}`;
const LEADING_NON_DIGIT_PATTERN = new RegExp(`^([^${DIGIT_CLASS}]*)([${DIGIT_CLASS}].*)$`);

/**
 * 「番地・建物名」欄(line1、町域+番地をまとめて自由入力してもらっている)を、
 * 通販ゲートの「町域」「番地」の2項目に分割する簡易処理。
 * 日本語住所は(町域などの地名)の後に(番地の数字)が続くのが一般的なため、
 * 最初に現れる数字の位置で前後に分割する。数字が全く含まれない場合は
 * 全体を町域として扱い、番地は空欄にする(完全に正確な分割を保証するものではない)。
 */
export function splitAddressLine1(line1: string): { chiiki: string; banchi: string } {
  const trimmed = line1.trim();
  const match = LEADING_NON_DIGIT_PATTERN.exec(trimmed);
  if (!match) return { chiiki: trimmed, banchi: "" };
  return { chiiki: match[1].trim(), banchi: match[2].trim() };
}

/** "YYYY-MM-DD"(HTML date input形式)を通販ゲートの"YY/MM/DD"(西暦下2桁)へ変換する。 */
export function toCoreSystemDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return "";
  const [, yyyy, mm, dd] = match;
  return `${yyyy.slice(2)}/${mm}/${dd}`;
}

/** 通販ゲート受注データ取込フォーマットの列見出し(59列)。この順序・表記のまま出力する(変更不可)。 */
export const CORE_SYSTEM_EXPORT_HEADER = [
  "web受注番号",
  "受付日",
  "注文者・氏名",
  "注文者・ｶﾅ氏名",
  "注文者・郵便番号",
  "注文者・都道府県",
  "注文者・市区郡",
  "注文者・町域",
  "注文者・番地",
  "注文者・方書1",
  "注文者・方書2",
  "注文者・電話番号",
  "注文者・性別",
  "注文者・誕生日",
  "注文者・会員番号",
  "注文者・メルアド",
  "注文者顧客区分",
  "届先・氏名",
  "届先・ｶﾅ氏名",
  "届先・郵便番号",
  "届先・都道府県",
  "届先・市区郡",
  "届先・町域",
  "届先・番地",
  "届先・方書1",
  "届先・方書2",
  "届先・電話番号",
  "決済方法",
  "与信管理番号",
  "クレジット会社",
  "カード番号",
  "カード名義人",
  "カード有効期限",
  "カード支払回数",
  "配送方法",
  "伝票記事",
  "配送希望日",
  "配送時間",
  "備考",
  "商品番号",
  "項目／選択肢",
  "単価",
  "個数",
  "商品合計",
  "税額",
  "手数料",
  "送料",
  "値引",
  "請求額",
  "商品名",
  "獲得ポイント",
  "使用ポイント",
  "DM発送区分",
  "受付CD",
  "媒体CD",
  "受電時間",
  "受電担当名",
  "FD",
  "番組CD",
] as const;

export interface CoreSystemCustomerRow {
  name: string;
  name_kana: string | null;
  email: string;
  phone: string | null;
  address: Address | null;
  gender: string | null;
  birth_date: string | null;
  smaregi_member_id: string | null;
}

export interface CoreSystemProductRow {
  id: string;
  name: string;
  price: number;
  smaregi_product_id: string | null;
  is_mail_deliverable: boolean;
}

/** 注文者・届先の共通部分(氏名/ｶﾅ/郵便番号/都道府県/市区郡/町域/番地/方書1/方書2/電話番号)を組み立てる。 */
export function buildCoreSystemPersonColumns(params: {
  name: string;
  nameKana: string;
  phone: string;
  address: Address | null;
}): string[] {
  const address = params.address;
  const { chiiki, banchi } = splitAddressLine1(address?.line1 ?? "");
  return [
    params.name,
    params.nameKana,
    address?.postalCode.replace(/[^0-9]/g, "") ?? "",
    address?.prefecture ?? "",
    address?.city ?? "",
    chiiki,
    banchi,
    address?.line2 ?? "",
    "",
    params.phone,
  ];
}

/**
 * 注文一覧を、基幹システム「通販ゲート」の受注データ取込フォーマット(59列)の行データに変換する。
 * 複数商品(アドオン)を含む注文は、メイン商品行の直後にアドオン商品行を追加し1商品=1行で出力する。
 */
export function buildCoreSystemExportRows(params: {
  orders: Record<string, unknown>[];
  customerById: Map<string, CoreSystemCustomerRow>;
  productById: Map<string, CoreSystemProductRow>;
}): string[][] {
  const { orders, customerById, productById } = params;
  const rows: string[][] = [];

  for (const order of orders) {
    const customer = customerById.get(order.customer_id as string);
    if (!customer) continue;
    const product = productById.get(order.product_id as string);
    if (!product) continue;
    const addonProduct = order.addon_product_id ? productById.get(order.addon_product_id as string) : undefined;

    const shippingAddress = order.shipping_address as ShippingAddress | null;
    const quantity = order.quantity as number;

    const ordererColumns = buildCoreSystemPersonColumns({
      name: customer.name,
      nameKana: customer.name_kana ?? "",
      phone: customer.phone ?? "",
      address: customer.address,
    });
    const shippingColumns = shippingAddress
      ? buildCoreSystemPersonColumns({
          name: shippingAddress.recipientName,
          nameKana: shippingAddress.recipientNameKana,
          phone: shippingAddress.recipientPhone,
          address: shippingAddress,
        })
      : buildCoreSystemPersonColumns({
          name: customer.name,
          // 届先を注文者と同じにする場合、届先ｶﾅ氏名は無回答(空欄)とする仕様のため注文者のｶﾅは流用しない
          nameKana: "",
          phone: customer.phone ?? "",
          address: customer.address,
        });

    const createdAtJst = new Date(order.created_at as string).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Tokyo",
    });

    const shippingMethodLabel = resolveShippingMethodLabel({
      isMailDeliverable: product.is_mail_deliverable,
      quantity,
      hasAddon: Boolean(addonProduct),
    });

    const productSubtotal = (order.amount as number) + ((order.addon_amount as number | null) ?? 0);
    const shippingFee = order.shipping_fee as number;
    const paymentFee = order.payment_fee as number;
    const discount =
      ((order.discount_amount as number | null) ?? 0) + ((order.first_time_discount_amount as number | null) ?? 0);
    const billedTotal = Math.max(0, productSubtotal + shippingFee + paymentFee - discount);

    const setSelections = (order.set_selections as { id: string; name: string }[] | null) ?? [];
    const itemOptionsText = setSelections.map((s) => s.name).join("、");

    // 13〜17列: 性別/誕生日/会員番号/メルアド/顧客区分(customerを非nullに絞り込んだこのスコープでまとめて計算しておく)
    const customerDetailColumns = [
      customer.gender || CORE_SYSTEM_GENDER_FALLBACK,
      customer.birth_date ? toCoreSystemDate(customer.birth_date) : "",
      customer.smaregi_member_id ?? "",
      customer.email,
      CORE_SYSTEM_CUSTOMER_CATEGORY,
    ];

    const orderLevelColumns = {
      webOrderNumber: (order.order_number as string | null) ?? "",
      receivedAt: toCoreSystemDate(createdAtJst),
      ordererColumns,
      customerDetailColumns,
      shippingColumns,
      paymentMethod: resolveCoreSystemPaymentMethodLabel(order.payment_method as string),
      shippingMethodLabel,
      deliveryDate: order.delivery_date ? toCoreSystemDate(order.delivery_date as string) : "",
      deliveryTimeSlot: toCoreSystemDeliveryTimeSlot(order.delivery_time_slot as string | null),
      invoiceNote: (order.invoice_note as string | null) ?? "",
      productSubtotal,
      shippingFee,
      paymentFee,
      discount,
      billedTotal,
    };

    function buildRow(line: {
      productNumber: string;
      itemOptions: string;
      unitPrice: number;
      qty: number;
      productName: string;
    }): string[] {
      return [
        orderLevelColumns.webOrderNumber,
        orderLevelColumns.receivedAt,
        // 3〜12列: 注文者・氏名/ｶﾅ氏名/郵便番号/都道府県/市区郡/町域/番地/方書1/方書2/電話番号
        ...orderLevelColumns.ordererColumns,
        // 13〜17列: 性別/誕生日/会員番号/メルアド/顧客区分
        ...orderLevelColumns.customerDetailColumns,
        // 18〜27列: 届先・氏名/ｶﾅ氏名/郵便番号/都道府県/市区郡/町域/番地/方書1/方書2/電話番号
        ...orderLevelColumns.shippingColumns,
        // 28列: 決済方法(Stripe以外は対応コードがないため空欄)
        orderLevelColumns.paymentMethod,
        // 29〜34列: 与信管理番号/クレジット会社/カード番号/カード名義人/カード有効期限/カード支払回数(未使用)
        "",
        "",
        "",
        "",
        "",
        "",
        // 35列: 配送方法
        orderLevelColumns.shippingMethodLabel,
        // 36列: 伝票記事(送り状への記載内容の指示。決済フォームで収集)
        orderLevelColumns.invoiceNote,
        // 37〜38列: 配送希望日/配送時間
        orderLevelColumns.deliveryDate,
        orderLevelColumns.deliveryTimeSlot,
        // 39列: 備考(未使用)
        "",
        // 40〜50列: 商品番号/項目選択肢/単価/個数/商品合計/税額/手数料/送料/値引/請求額/商品名
        line.productNumber,
        line.itemOptions,
        String(line.unitPrice),
        String(line.qty),
        String(orderLevelColumns.productSubtotal),
        "0",
        String(orderLevelColumns.paymentFee),
        String(orderLevelColumns.shippingFee),
        String(orderLevelColumns.discount),
        String(orderLevelColumns.billedTotal),
        line.productName,
        // 51〜59列: 獲得ポイント/使用ポイント/DM発送区分/受付CD/媒体CD/受電時間/受電担当名/FD/番組CD
        "0",
        "0",
        "1",
        CORE_SYSTEM_RECEPTION_CD,
        CORE_SYSTEM_MEDIA_CODE,
        "",
        "",
        "",
        "",
      ];
    }

    rows.push(
      buildRow({
        productNumber: product.smaregi_product_id ?? "",
        itemOptions: itemOptionsText,
        unitPrice: product.price,
        qty: quantity,
        productName: product.name,
      }),
    );

    if (addonProduct) {
      rows.push(
        buildRow({
          productNumber: addonProduct.smaregi_product_id ?? "",
          itemOptions: "",
          unitPrice: (order.addon_amount as number | null) ?? addonProduct.price,
          qty: 1,
          productName: addonProduct.name,
        }),
      );
    }
  }

  return rows;
}
