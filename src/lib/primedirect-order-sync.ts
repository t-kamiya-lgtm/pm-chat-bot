import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customers, orders, products, smaregiSyncLogs } from "@/db/schema";
import { createOrder, type CreateOrderInput } from "@/lib/adapters/smaregi-order-api";
import {
  findCustomerByEmail,
  generateTemporaryPassword,
  issueTemporaryPassword,
} from "@/lib/adapters/smaregi-customer-api";
import { sendMemberRegistrationEmail, sendSmaregiSyncFailureAlert } from "@/lib/email";
import type { Db } from "@/lib/db";

/**
 * Stripe決済で確定した注文を、primedirect.jp受注APIへ連携する
 * (new-chatbotリポジトリ docs/smaregi-cart-handoff-research.md 4.7・5.1で決定した方式)。
 *
 * - `customer_id: -1`を指定し、メールアドレスによる自動名寄せをスマレジ側に任せる
 *   (実機検証・API仕様書の両方で、同一メールアドレスの注文は既存顧客に統合されることを確認済み)。
 * - カードの2回目以降の請求はStripe Billingが担うため、このカード決済の連携では
 *   `periodical_order`は指定しない(代引き・後払いの定期購入とは別経路)。
 * - **未確定のまま残っている項目(5.5参照)**: `payment_id`のカード決済相当の実際の値、
 *   `payment_status`の決済済みに相当する実際の値、`ec_type`/`order_root`/`order_status`/
 *   `deliv_id`/`hasso_deliv_kbn`の実際に有効な値。本番の`debug-orders`エンドポイントでの
 *   確認、およびスマレジ側の管理画面設定の確認が必要。それまでは暫定値を使い、失敗時は
 *   `smaregi_sync_logs`に記録するのみでStripe Webhook本体の処理は止めない(fail-safe)。
 *
 * 本番接続(`SMAREGI_DOMAIN`/OAuth連携)が未設定の間は`createOrder`が例外を投げるため、
 * その間はここで捕捉してログに残すだけになる(=既存の基幹システム連携には一切影響しない)。
 */
export async function submitStripeOrderToSmaregi(orderId: string): Promise<void> {
  const db = await getDb();
  let payload: CreateOrderInput | null = null;
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;

    const [[customer], [product], [addonProduct]] = await Promise.all([
      db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1),
      db.select().from(products).where(eq(products.id, order.productId)).limit(1),
      order.addonProductId
        ? db.select().from(products).where(eq(products.id, order.addonProductId)).limit(1)
        : Promise.resolve([null]),
    ]);
    if (!customer || !product) return;

    // 注文作成前に既存会員かどうかを確認しておく(注文成功後に「新規登録された」と誤判定して
    // 既存会員へ会員登録完了メールを再送しないようにするため)。
    const existingBefore = await findCustomerByEmail(customer.email).catch(() => null);

    const [lastName, firstName] = customer.name.split(/\s+/);
    const [lastNameKana, firstNameKana] = (customer.nameKana ?? "").split(/\s+/);
    const shipping = order.shippingAddress as {
      recipientName: string;
      recipientPhone: string;
      postalCode: string;
      prefecture: string;
      city: string;
      line1: string;
      line2?: string;
    } | null;
    const [shipLastName, shipFirstName] = (shipping?.recipientName ?? customer.name).split(/\s+/);
    const address = customer.address as {
      postalCode: string;
      prefecture: string;
      city: string;
      line1: string;
      line2?: string;
    } | null;

    // 消費税率が未設定(旧データ等)の場合は標準税率10%を仮定する(要確認: 軽減税率対象商品の場合は別途対応が必要)。
    const taxRate = order.taxRate ? Number(order.taxRate) : 0.1;
    const total = order.amount + order.shippingFee + order.paymentFee - order.discountAmount;
    const totalNotax = Math.round(total / (1 + taxRate));
    const tax = total - totalNotax;

    const details: CreateOrderInput["details"] = [
      {
        productCode: product.smaregiProductId ?? product.id,
        productName: product.name,
        quantity: order.quantity,
        priceIntax: product.price,
        taxFlag: "込",
        taxRate,
        tax: Math.round((product.price * order.quantity * taxRate) / (1 + taxRate)),
        total: product.price * order.quantity,
        productRegFlag: order.type === "subscription" ? "定期" : "商品",
      },
    ];
    if (addonProduct) {
      details.push({
        productCode: addonProduct.smaregiProductId ?? addonProduct.id,
        productName: addonProduct.name,
        quantity: 1,
        priceIntax: order.addonAmount ?? addonProduct.price,
        taxFlag: "込",
        taxRate,
        tax: Math.round(((order.addonAmount ?? addonProduct.price) * taxRate) / (1 + taxRate)),
        total: order.addonAmount ?? addonProduct.price,
        productRegFlag: "商品",
      });
    }

    payload = {
      ecOrderId: order.orderNumber ?? order.id,
      // 要確認: primedirect.jp契約側で有効なEC種類コード(4.6.2)
      ecType: "1",
      orderer: {
        email: customer.email,
        lastName: lastName ?? customer.name,
        firstName,
        lastNameKana: lastNameKana || undefined,
        firstNameKana: firstNameKana || undefined,
        tel: customer.phone ?? "",
        zip: address?.postalCode ?? "",
        pref: address?.prefecture ?? "",
        addr01: `${address?.city ?? ""}${address?.line1 ?? ""}`,
        addr02: address?.line2,
      },
      shipping: {
        lastName: shipLastName ?? customer.name,
        firstName: shipFirstName,
        tel: shipping?.recipientPhone ?? customer.phone ?? "",
        zip: shipping?.postalCode ?? address?.postalCode ?? "",
        pref: shipping?.prefecture ?? address?.prefecture ?? "",
        addr01: shipping ? `${shipping.city}${shipping.line1}` : `${address?.city ?? ""}${address?.line1 ?? ""}`,
        addr02: shipping?.line2 ?? address?.line2,
      },
      details,
      subtotal: totalNotax,
      total,
      totalNotax,
      totalTax: tax,
      tax,
      delivFee: order.shippingFee,
      delivFeeNotax: Math.round(order.shippingFee / (1 + taxRate)),
      charge: order.paymentFee,
      chargeNotax: Math.round(order.paymentFee / (1 + taxRate)),
      paymentTotal: total,
      // 要確認: primedirect.jp契約側で有効なカード決済のpayment_id(旧実装の実績値は77)
      paymentId: 77,
      // 要確認: 有効な配送方法ID
      delivId: 1,
      // 要確認: 有効な受注ルートID
      orderRoot: 1,
      // 要確認: マスタに一致する受注ステータス名
      orderStatus: "受付",
      // 要確認: 配送区分
      hassoDelivKbn: "1",
      reserveType: order.type === "subscription" ? "3" : "0",
      // 要確認: 決済済みに相当する実際の値(4.6.2・5.5)。判明するまでの暫定値。
      paymentStatus: 1,
    };

    const response = await createOrder(payload);
    await db.insert(smaregiSyncLogs).values({ orderId, payload: { request: payload, response }, status: "ok" });

    if (existingBefore) {
      // 既存会員(2回目以降の注文、または他チャネルで既に会員登録済み)。会員登録完了メールは送らない。
      await db
        .update(customers)
        .set({ smaregiMemberId: existingBefore.customer_id, smaregiSyncedAt: new Date().toISOString() })
        .where(eq(customers.id, customer.id));
    } else {
      // 今回の注文で新規に会員登録された(customer_id=-1による自動作成)とみなし、
      // 仮パスワードを発行して会員登録完了メールを送る(4.6.1・4.7参照)。
      const matched = await findCustomerByEmail(customer.email).catch(() => null);
      if (matched) {
        const temporaryPassword = generateTemporaryPassword();
        await issueTemporaryPassword(matched.customer_id, temporaryPassword);
        await db
          .update(customers)
          .set({ smaregiMemberId: matched.customer_id, smaregiSyncedAt: new Date().toISOString() })
          .where(eq(customers.id, customer.id));
        await sendMemberRegistrationEmail({ to: customer.email, name: customer.name, temporaryPassword });
      }
    }
  } catch (err) {
    console.error("[primedirect-order-sync] failed to submit order", { orderId, err });
    await recordSyncError(db, orderId, payload, err);
    await sendSmaregiSyncFailureAlert({
      orderId,
      orderNumber: payload?.ecOrderId ?? null,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  }
}

async function recordSyncError(db: Db, orderId: string, payload: CreateOrderInput | null, err: unknown): Promise<void> {
  await db.insert(smaregiSyncLogs).values({
    orderId,
    payload: { request: payload },
    status: "error",
    error: err instanceof Error ? err.message : String(err),
  });
}
