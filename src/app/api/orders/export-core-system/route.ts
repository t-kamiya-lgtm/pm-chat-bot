import iconv from "iconv-lite";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { readOrderFilters, applyOrderFilters } from "@/lib/order-filters";
import {
  CORE_SYSTEM_CUSTOMER_CATEGORY,
  CORE_SYSTEM_EXPORT_HEADER,
  CORE_SYSTEM_GENDER_FALLBACK,
  CORE_SYSTEM_MEDIA_CODE,
  CORE_SYSTEM_PAYMENT_METHOD_LABEL,
  CORE_SYSTEM_RECEPTION_CD,
  resolveShippingMethodLabel,
  splitAddressLine1,
  toCoreSystemDate,
  toCoreSystemDeliveryTimeSlot,
} from "@/lib/core-system-export";
import type { Address, ShippingAddress } from "@/lib/types";

/** カンマ・改行・ダブルクオートを含む値のみ引用符で囲む(仕様の「引用符: 必要な値のみ」に合わせる)。 */
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

interface CustomerRow {
  name: string;
  name_kana: string | null;
  email: string;
  phone: string | null;
  address: Address | null;
  gender: string | null;
  birth_date: string | null;
  smaregi_member_id: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  smaregi_product_id: string | null;
  is_mail_deliverable: boolean;
}

/** 注文者・届先の共通部分(氏名/ｶﾅ/郵便番号/都道府県/市区郡/町域/番地/方書1/方書2/電話番号)を組み立てる。 */
function buildPersonColumns(params: {
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

/** 注文一覧(Stripe決済のみ)を、基幹システム「通販ゲート」の受注データ取込フォーマット(59列)でCSV出力する。 */
export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const filters = readOrderFilters((key) => searchParams.get(key));

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("orders")
    .select("*")
    .eq("payment_method", "stripe")
    .order("created_at", { ascending: false });
  query = applyOrderFilters(query, filters);
  if (!filters.showAll && !filters.orderIds?.length) query = query.limit(100);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const customerIds = [...new Set((orders ?? []).map((o) => o.customer_id as string))];
  const productIds = [
    ...new Set(
      (orders ?? []).flatMap((o) =>
        [o.product_id as string, o.addon_product_id as string | null].filter((id): id is string => Boolean(id)),
      ),
    ),
  ];

  const [{ data: customers, error: customersError }, { data: products, error: productsError }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, name_kana, email, phone, address, gender, birth_date, smaregi_member_id")
      .in("id", customerIds),
    supabase
      .from("products")
      .select("id, name, price, smaregi_product_id, is_mail_deliverable")
      .in("id", productIds),
  ]);
  if (customersError) return NextResponse.json({ error: customersError.message }, { status: 500 });
  if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });

  const customerById = new Map<string, CustomerRow>((customers ?? []).map((c) => [c.id as string, c as CustomerRow]));
  const productById = new Map<string, ProductRow>((products ?? []).map((p) => [p.id as string, p as ProductRow]));

  const rows: string[][] = [];

  for (const order of orders ?? []) {
    const customer = customerById.get(order.customer_id as string);
    if (!customer) continue;
    const product = productById.get(order.product_id as string);
    if (!product) continue;
    const addonProduct = order.addon_product_id
      ? productById.get(order.addon_product_id as string)
      : undefined;

    const shippingAddress = order.shipping_address as ShippingAddress | null;
    const quantity = order.quantity as number;

    const ordererColumns = buildPersonColumns({
      name: customer.name,
      nameKana: customer.name_kana ?? "",
      phone: customer.phone ?? "",
      address: customer.address,
    });
    const shippingColumns = shippingAddress
      ? buildPersonColumns({
          name: shippingAddress.recipientName,
          nameKana: shippingAddress.recipientNameKana,
          phone: shippingAddress.recipientPhone,
          address: shippingAddress,
        })
      : buildPersonColumns({
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
      paymentMethod: CORE_SYSTEM_PAYMENT_METHOD_LABEL,
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

    function buildRow(line: { productNumber: string; itemOptions: string; unitPrice: number; qty: number; productName: string }): string[] {
      return [
        orderLevelColumns.webOrderNumber,
        orderLevelColumns.receivedAt,
        // 3〜12列: 注文者・氏名/ｶﾅ氏名/郵便番号/都道府県/市区郡/町域/番地/方書1/方書2/電話番号
        ...orderLevelColumns.ordererColumns,
        // 13〜17列: 性別/誕生日/会員番号/メルアド/顧客区分
        ...orderLevelColumns.customerDetailColumns,
        // 18〜27列: 届先・氏名/ｶﾅ氏名/郵便番号/都道府県/市区郡/町域/番地/方書1/方書2/電話番号
        ...orderLevelColumns.shippingColumns,
        // 28列: 決済方法
        orderLevelColumns.paymentMethod,
        // 29〜34列: 与信管理番号/クレジット会社/カード番号/カード名義人/カード有効期限/カード支払回数(Stripeのため未使用)
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

  const csv = [Array.from(CORE_SYSTEM_EXPORT_HEADER), ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const buffer = iconv.encode(csv, "cp932");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="core_system_orders_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
