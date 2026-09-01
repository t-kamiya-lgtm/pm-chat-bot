import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders, subscriptionItems, subscriptions } from "@/db/schema";
import { requireAdminRole } from "@/lib/require-role";
import { getProductById } from "@/lib/products";
import { diffFields, recordChangeLog } from "@/lib/customer-change-log";

const addSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  unitAmount: z.number().int().min(0),
});

const removeSchema = z.object({ subscriptionItemId: z.string().uuid() });

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 定期プラン(顧客管理画面①)に、本体と同じ頻度・お届け日で生成し続ける商品を追加する
 * (「次回お届けより同梱」「初回は即出荷し、次回より同梱」で選ばれた場合の同梱登録)。
 * Stripeの定期購入は対象外(途中からの商品追加はお客様に再度注文いただく方針のため)。
 */
export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = await getDb();
  let order;
  try {
    [order] = await db
      .select({ id: orders.id, customerId: orders.customerId, type: orders.type, paymentMethod: orders.paymentMethod, parentOrderId: orders.parentOrderId })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.type !== "subscription" || order.parentOrderId) {
    return NextResponse.json({ error: "定期の親注文(初回)に対してのみ追加できます" }, { status: 400 });
  }
  if (order.paymentMethod === "stripe") {
    return NextResponse.json(
      { error: "Stripeの定期購入への商品追加には対応していません" },
      { status: 400 },
    );
  }

  const product = await getProductById(parsed.data.productId);
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });

  let subscriptionRow;
  try {
    [subscriptionRow] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.orderId, order.id))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!subscriptionRow) return NextResponse.json({ error: "subscription not found" }, { status: 404 });

  let item;
  try {
    [item] = await db
      .insert(subscriptionItems)
      .values({
        subscriptionId: subscriptionRow.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        unitAmount: parsed.data.unitAmount,
        createdBy: roleCheck.user.id,
      })
      .returning({ id: subscriptionItems.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  await recordChangeLog(db, {
    customerId: order.customerId,
    subscriptionId: subscriptionRow.id,
    action: "subscription_item_add",
    changes: diffFields([
      {
        field: "subscriptionItem",
        label: "同梱商品追加",
        before: null,
        after: `${product.name} × ${parsed.data.quantity}(¥${parsed.data.unitAmount})`,
      },
    ]),
    changedByEmail: roleCheck.user.email,
  });

  return NextResponse.json({ subscriptionItemId: item.id }, { status: 201 });
}

/** 定期プランに追加した商品を終了する(削除ではなく終了扱いにして履歴を残す)。 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = await getDb();
  let order;
  try {
    [order] = await db
      .select({ id: orders.id, customerId: orders.customerId })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  let item;
  try {
    [item] = await db
      .select({
        id: subscriptionItems.id,
        subscriptionId: subscriptionItems.subscriptionId,
        productId: subscriptionItems.productId,
        quantity: subscriptionItems.quantity,
        unitAmount: subscriptionItems.unitAmount,
        subscriptionOrderId: subscriptions.orderId,
      })
      .from(subscriptionItems)
      .innerJoin(subscriptions, eq(subscriptionItems.subscriptionId, subscriptions.id))
      .where(eq(subscriptionItems.id, parsed.data.subscriptionItemId))
      .limit(1);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!item || item.subscriptionOrderId !== order.id) {
    return NextResponse.json({ error: "subscription item not found" }, { status: 404 });
  }

  try {
    await db.update(subscriptionItems).set({ removedAt: new Date().toISOString() }).where(eq(subscriptionItems.id, item.id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const product = await getProductById(item.productId);
  await recordChangeLog(db, {
    customerId: order.customerId,
    subscriptionId: item.subscriptionId,
    action: "subscription_item_remove",
    changes: diffFields([
      {
        field: "subscriptionItem",
        label: "同梱商品終了",
        before: `${product?.name ?? item.productId} × ${item.quantity}(¥${item.unitAmount})`,
        after: null,
      },
    ]),
    changedByEmail: roleCheck.user.email,
  });

  return NextResponse.json({ ok: true });
}
