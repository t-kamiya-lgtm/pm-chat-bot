import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { checkoutFieldOrder, coupons, products, scenarioMenuItems, scenarioNodes, scenarios } from "@/db/schema";
import { ScenarioEditor } from "@/components/admin/ScenarioEditor";
import { DEFAULT_CHECKOUT_FIELD_ORDER, mergeCheckoutFieldOrder, type CheckoutFieldKey } from "@/lib/checkout-fields";
import type {
  Coupon,
  MenuItemActionType,
  Scenario,
  ScenarioMenuItem,
  ScenarioNode,
} from "@/lib/types";

export const dynamic = "force-dynamic";

function mapMenuItemRow(row: typeof scenarioMenuItems.$inferSelect): ScenarioMenuItem {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    label: row.label,
    actionType: row.actionType as MenuItemActionType,
    targetNodeId: row.targetNodeId,
    url: row.url,
    displayOrder: row.displayOrder ?? 0,
  };
}

function mapCouponRow(row: typeof coupons.$inferSelect): Coupon {
  return {
    id: row.id,
    type: row.type as Coupon["type"],
    scenarioId: row.scenarioId,
    code: row.code,
    name: row.name,
    discountType: row.discountType as Coupon["discountType"],
    discountValue: row.discountValue,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    minOrderAmount: row.minOrderAmount,
    isActive: row.isActive,
    imageUrl: row.imageUrl,
    promoMessage: row.promoMessage,
    targetProductIds: row.targetProductIds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapNodeRow(row: typeof scenarioNodes.$inferSelect): ScenarioNode {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    type: row.type as ScenarioNode["type"],
    content: row.content as Record<string, unknown>,
    nextNodeMap: row.nextNodeMap as Record<string, string>,
    isEntry: row.isEntry,
    displayOrder: row.displayOrder ?? 0,
    memo: row.memo,
    createdAt: row.createdAt,
  };
}

export default async function ScenarioEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();

  const [scenarioResult, nodesResult, productsResult, menuItemsResult, couponsResult, checkoutFieldOrderResult] =
    await Promise.allSettled([
      db.select().from(scenarios).where(eq(scenarios.id, id)).limit(1),
      db
        .select()
        .from(scenarioNodes)
        .where(eq(scenarioNodes.scenarioId, id))
        .orderBy(asc(scenarioNodes.displayOrder)),
      db.query.products.findMany({
        columns: {
          id: true,
          name: true,
          price: true,
          orderType: true,
          imageUrl: true,
          productGroupId: true,
        },
        orderBy: [desc(products.createdAt)],
        with: { productGroup: { columns: { name: true } } },
      }),
      db
        .select()
        .from(scenarioMenuItems)
        .where(eq(scenarioMenuItems.scenarioId, id))
        .orderBy(asc(scenarioMenuItems.displayOrder)),
      db
        .select()
        .from(coupons)
        .where(and(eq(coupons.scenarioId, id), eq(coupons.type, "scenario_auto")))
        .orderBy(asc(coupons.createdAt))
        .limit(1),
      db
        .select({ fieldKey: checkoutFieldOrder.fieldKey })
        .from(checkoutFieldOrder)
        .where(eq(checkoutFieldOrder.scenarioId, id))
        .orderBy(asc(checkoutFieldOrder.displayOrder)),
    ]);

  const scenario = scenarioResult.status === "fulfilled" ? scenarioResult.value[0] : undefined;
  if (!scenario) notFound();

  const nodeRows = nodesResult.status === "fulfilled" ? nodesResult.value : [];
  const productRows = productsResult.status === "fulfilled" ? productsResult.value : [];
  const productsError =
    productsResult.status === "rejected"
      ? productsResult.reason instanceof Error
        ? productsResult.reason.message
        : String(productsResult.reason)
      : null;
  const menuItemRows = menuItemsResult.status === "fulfilled" ? menuItemsResult.value : [];
  const couponRows = couponsResult.status === "fulfilled" ? couponsResult.value : [];
  const checkoutFieldOrderRows =
    checkoutFieldOrderResult.status === "fulfilled" ? checkoutFieldOrderResult.value : [];

  const checkoutFieldOrderValue =
    checkoutFieldOrderRows.length > 0
      ? mergeCheckoutFieldOrder(checkoutFieldOrderRows.map((row) => row.fieldKey as CheckoutFieldKey))
      : DEFAULT_CHECKOUT_FIELD_ORDER;

  return (
    <div>
      {productsError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          品番一覧の取得に失敗しました({productsError})。品番の選択・アップセル/クロスセルの設定ができません。
        </p>
      )}
      <ScenarioEditor
        scenario={{
          id: scenario.id,
          name: scenario.name,
          status: scenario.status as Scenario["status"],
          slug: scenario.slug,
          orderCode: scenario.orderCode,
          chatBackgroundColor: scenario.chatBackgroundColor,
          menuBackgroundColor: scenario.menuBackgroundColor,
          menuTextColor: scenario.menuTextColor as Scenario["menuTextColor"],
          messageBackgroundColor: scenario.messageBackgroundColor,
          messageTextColor: scenario.messageTextColor as Scenario["messageTextColor"],
          userMessageBackgroundColor: scenario.userMessageBackgroundColor,
          userMessageTextColor: scenario.userMessageTextColor as Scenario["userMessageTextColor"],
          headerMode: scenario.headerMode as Scenario["headerMode"],
          headerImageUrl: scenario.headerImageUrl,
          headerTitle: scenario.headerTitle,
          headerBackgroundColor: scenario.headerBackgroundColor,
          headerTextColor: scenario.headerTextColor as Scenario["headerTextColor"],
          adTag: scenario.adTag,
          conversionTag: scenario.conversionTag,
          emailFromAddress: scenario.emailFromAddress,
          inquiryReceiveEmail: scenario.inquiryReceiveEmail,
          inquiryAutoReplyFrom: scenario.inquiryAutoReplyFrom,
          orderConfirmationFrom: scenario.orderConfirmationFrom,
          abandonedReminderFrom: scenario.abandonedReminderFrom,
          cancellationFrom: scenario.cancellationFrom,
          shipmentCompleteFrom: scenario.shipmentCompleteFrom,
          popupIconUrl: scenario.popupIconUrl,
          popupPosition: scenario.popupPosition as Scenario["popupPosition"],
          popupButtonText: scenario.popupButtonText,
          couponCodeFieldEnabled: scenario.couponCodeFieldEnabled,
          menuLayoutKey: scenario.menuLayoutKey ?? "row-3",
          menuImageUrl: scenario.menuImageUrl,
          version: scenario.version,
          createdBy: scenario.createdBy,
          createdAt: scenario.createdAt,
          updatedAt: scenario.updatedAt,
        }}
        nodes={nodeRows.map(mapNodeRow)}
        products={productRows.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          orderType: p.orderType as "one_time" | "subscription",
          imageUrl: p.imageUrl,
          productGroupId: p.productGroupId,
          productGroupName: p.productGroup?.name ?? null,
        }))}
        menuItems={menuItemRows.map(mapMenuItemRow)}
        coupon={couponRows.length > 0 ? mapCouponRow(couponRows[0]) : null}
        checkoutFieldOrder={checkoutFieldOrderValue}
      />
    </div>
  );
}
