import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ScenarioEditor } from "@/components/admin/ScenarioEditor";
import type { Coupon, MenuItemActionType, ScenarioMenuItem, ScenarioNode } from "@/lib/types";

export const dynamic = "force-dynamic";

function extractGroupName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return (row as { name?: string } | null)?.name ?? null;
}

function mapMenuItemRow(row: Record<string, unknown>): ScenarioMenuItem {
  return {
    id: row.id as string,
    scenarioId: row.scenario_id as string,
    label: row.label as string,
    actionType: row.action_type as MenuItemActionType,
    targetNodeId: (row.target_node_id as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    displayOrder: (row.display_order as number | null) ?? 0,
  };
}

function mapCouponRow(row: Record<string, unknown>): Coupon {
  return {
    id: row.id as string,
    type: row.type as Coupon["type"],
    scenarioId: (row.scenario_id as string | null) ?? null,
    code: (row.code as string | null) ?? null,
    name: row.name as string,
    discountType: row.discount_type as Coupon["discountType"],
    discountValue: row.discount_value as number,
    startsAt: (row.starts_at as string | null) ?? null,
    endsAt: (row.ends_at as string | null) ?? null,
    maxUses: (row.max_uses as number | null) ?? null,
    usedCount: row.used_count as number,
    minOrderAmount: (row.min_order_amount as number | null) ?? null,
    isActive: row.is_active as boolean,
    imageUrl: (row.image_url as string | null) ?? null,
    promoMessage: (row.promo_message as string | null) ?? null,
    targetProductIds: (row.target_product_ids as string[] | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapNodeRow(row: Record<string, unknown>): ScenarioNode {
  return {
    id: row.id as string,
    scenarioId: row.scenario_id as string,
    type: row.type as ScenarioNode["type"],
    content: row.content as Record<string, unknown>,
    nextNodeMap: row.next_node_map as Record<string, string>,
    isEntry: row.is_entry as boolean,
    displayOrder: (row.display_order as number | null) ?? 0,
    memo: (row.memo as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export default async function ScenarioEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const [
    { data: scenario },
    { data: nodes },
    { data: products, error: productsError },
    { data: menuItems },
    { data: coupons },
  ] = await Promise.all([
    supabase.from("scenarios").select("*").eq("id", id).maybeSingle(),
    supabase.from("scenario_nodes").select("*").eq("scenario_id", id).order("display_order"),
    supabase
      .from("products")
      .select("id, name, price, order_type, image_url, product_group_id, product_groups(name)")
      .order("created_at", { ascending: false }),
    supabase.from("scenario_menu_items").select("*").eq("scenario_id", id).order("display_order"),
    supabase
      .from("coupons")
      .select("*")
      .eq("scenario_id", id)
      .eq("type", "scenario_auto")
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  if (!scenario) notFound();

  return (
    <div>
      {productsError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          品番一覧の取得に失敗しました({productsError.message})。品番の選択・アップセル/クロスセルの設定ができません。
        </p>
      )}
      <ScenarioEditor
        scenario={{
          id: scenario.id,
          name: scenario.name,
          status: scenario.status,
          slug: scenario.slug,
          orderCode: scenario.order_code,
          chatBackgroundColor: scenario.chat_background_color,
          menuBackgroundColor: scenario.menu_background_color,
          menuTextColor: scenario.menu_text_color,
          messageBackgroundColor: scenario.message_background_color,
          messageTextColor: scenario.message_text_color,
          userMessageBackgroundColor: scenario.user_message_background_color,
          userMessageTextColor: scenario.user_message_text_color,
          headerMode: scenario.header_mode,
          headerImageUrl: scenario.header_image_url,
          headerTitle: scenario.header_title,
          headerBackgroundColor: scenario.header_background_color,
          headerTextColor: scenario.header_text_color,
          adTag: scenario.ad_tag,
          conversionTag: scenario.conversion_tag,
          emailFromAddress: scenario.email_from_address,
          inquiryReceiveEmail: scenario.inquiry_receive_email,
          inquiryAutoReplyFrom: scenario.inquiry_auto_reply_from,
          orderConfirmationFrom: scenario.order_confirmation_from,
          abandonedReminderFrom: scenario.abandoned_reminder_from,
          cancellationFrom: scenario.cancellation_from,
          shipmentCompleteFrom: scenario.shipment_complete_from,
          popupIconUrl: scenario.popup_icon_url,
          popupPosition: scenario.popup_position,
          couponCodeFieldEnabled: scenario.coupon_code_field_enabled,
          version: scenario.version,
          createdBy: scenario.created_by,
          createdAt: scenario.created_at,
          updatedAt: scenario.updated_at,
        }}
        nodes={(nodes ?? []).map(mapNodeRow)}
        products={(products ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          price: p.price as number,
          orderType: p.order_type as "one_time" | "subscription",
          imageUrl: (p.image_url as string | null) ?? null,
          productGroupId: p.product_group_id as string | null,
          productGroupName: extractGroupName(p.product_groups),
        }))}
        menuItems={(menuItems ?? []).map(mapMenuItemRow)}
        coupon={coupons && coupons.length > 0 ? mapCouponRow(coupons[0]) : null}
      />
    </div>
  );
}
