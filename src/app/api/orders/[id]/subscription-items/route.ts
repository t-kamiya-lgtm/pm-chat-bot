import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const supabase = createSupabaseAdminClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_id, type, payment_method, parent_order_id")
    .eq("id", id)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });
  if (order.type !== "subscription" || order.parent_order_id) {
    return NextResponse.json({ error: "定期の親注文(初回)に対してのみ追加できます" }, { status: 400 });
  }
  if (order.payment_method === "stripe") {
    return NextResponse.json(
      { error: "Stripeの定期購入への商品追加には対応していません" },
      { status: 400 },
    );
  }

  const product = await getProductById(parsed.data.productId);
  if (!product) return NextResponse.json({ error: "product not found" }, { status: 404 });

  const { data: subscriptionRow, error: subError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();
  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });
  if (!subscriptionRow) return NextResponse.json({ error: "subscription not found" }, { status: 404 });

  const { data: item, error: insertError } = await supabase
    .from("subscription_items")
    .insert({
      subscription_id: subscriptionRow.id,
      product_id: parsed.data.productId,
      quantity: parsed.data.quantity,
      unit_amount: parsed.data.unitAmount,
      created_by: roleCheck.user.id,
    })
    .select("id")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await recordChangeLog(supabase, {
    customerId: order.customer_id,
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

  const supabase = createSupabaseAdminClient();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_id")
    .eq("id", id)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const { data: item, error: itemError } = await supabase
    .from("subscription_items")
    .select("id, subscription_id, product_id, quantity, unit_amount, subscriptions!inner(order_id)")
    .eq("id", parsed.data.subscriptionItemId)
    .maybeSingle();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 });
  if (!item || (item.subscriptions as unknown as { order_id: string }).order_id !== order.id) {
    return NextResponse.json({ error: "subscription item not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("subscription_items")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", item.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const product = await getProductById(item.product_id);
  await recordChangeLog(supabase, {
    customerId: order.customer_id,
    subscriptionId: item.subscription_id,
    action: "subscription_item_remove",
    changes: diffFields([
      {
        field: "subscriptionItem",
        label: "同梱商品終了",
        before: `${product?.name ?? item.product_id} × ${item.quantity}(¥${item.unit_amount})`,
        after: null,
      },
    ]),
    changedByEmail: roleCheck.user.email,
  });

  return NextResponse.json({ ok: true });
}
