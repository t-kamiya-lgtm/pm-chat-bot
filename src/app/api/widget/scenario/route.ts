import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coupons, products, productSetOptions, scenarioMenuItems, scenarioNodes, scenarios } from "@/db/schema";
import { sanitizeSubscriptionIntervals } from "@/lib/subscription-intervals";

/**
 * チャットウィジェット用の公開エンドポイント(認証不要)。
 * 公開済み(status=published)シナリオのノード一覧と、
 * そのノードが参照する商品情報をまとめて返す。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("id");
  const slug = searchParams.get("slug");
  const isPreview = searchParams.get("preview") === "1";

  try {
    const db = await getDb();

    let scenario;
    if (scenarioId && isPreview) {
      // 管理画面からのプレビュー用: 下書きでも指定IDのシナリオをそのまま表示する
      [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).limit(1);
    } else if (scenarioId) {
      [scenario] = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, scenarioId), eq(scenarios.status, "published")))
        .limit(1);
    } else if (slug) {
      // ブランド・商品ごとに発行した専用URL(/widget/<slug>)からの公開アクセス
      [scenario] = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.slug, slug), eq(scenarios.status, "published")))
        .limit(1);
    } else {
      [scenario] = await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.status, "published"))
        .orderBy(desc(scenarios.updatedAt))
        .limit(1);
    }

    if (!scenario) return NextResponse.json({ error: "no published scenario" }, { status: 404 });

    // memoは管理用メモのため、チャットボット側には一切送らない
    const nodeRows = await db
      .select({
        id: scenarioNodes.id,
        scenarioId: scenarioNodes.scenarioId,
        type: scenarioNodes.type,
        content: scenarioNodes.content,
        nextNodeMap: scenarioNodes.nextNodeMap,
        isEntry: scenarioNodes.isEntry,
        displayOrder: scenarioNodes.displayOrder,
        createdAt: scenarioNodes.createdAt,
      })
      .from(scenarioNodes)
      .where(eq(scenarioNodes.scenarioId, scenario.id))
      .orderBy(asc(scenarioNodes.displayOrder));

    const QA_TARGET_PREFIX = "qa:";

    // クーポン表示ノードは、シナリオの自動適用クーポン(scenario_auto)の告知内容をそのまま表示する。
    // 対象商品限定クーポンの「クーポン対象商品提示」機能で使う商品データを後段の取得に含めるため、
    // 商品ID一覧の組み立てより前に取得する。
    let coupon: Record<string, unknown> | null = null;
    if (nodeRows.some((n) => n.type === "coupon")) {
      const [row] = await db
        .select({
          code: coupons.code,
          name: coupons.name,
          discountType: coupons.discountType,
          discountValue: coupons.discountValue,
          imageUrl: coupons.imageUrl,
          promoMessage: coupons.promoMessage,
          isActive: coupons.isActive,
          minOrderAmount: coupons.minOrderAmount,
          targetProductIds: coupons.targetProductIds,
        })
        .from(coupons)
        .where(and(eq(coupons.scenarioId, scenario.id), eq(coupons.type, "scenario_auto")))
        .limit(1);
      coupon =
        row && row.isActive
          ? {
              code: row.code,
              name: row.name,
              discount_type: row.discountType,
              discount_value: row.discountValue,
              image_url: row.imageUrl,
              promo_message: row.promoMessage,
              is_active: row.isActive,
              min_order_amount: row.minOrderAmount,
              target_product_ids: row.targetProductIds,
            }
          : null;
    }

    const productIds = Array.from(
      new Set([
        ...nodeRows
          .flatMap((n) => {
            if (n.type === "choice") {
              // 選択肢分岐ノードの「その場でQ&Aを表示する」設定(next_node_mapのsentinel値)から商品IDを拾う
              return Object.values(n.nextNodeMap as Record<string, string>)
                .filter((v) => v.startsWith(QA_TARGET_PREFIX))
                .map((v) => v.slice(QA_TARGET_PREFIX.length).split("|")[0]);
            }
            if (n.type !== "product" && n.type !== "checkout" && n.type !== "product_qa") return [];
            const content = n.content as {
              productId?: string;
              productIds?: string[];
              upsellProductId?: string;
              crossSellProductId?: string;
              productUpsell?: Record<string, { upsellProductId?: string; crossSellProductId?: string }>;
            };
            const ids = Array.isArray(content?.productIds)
              ? [...content.productIds]
              : content?.productId
                ? [content.productId]
                : [];
            // 決済導線ノード自身に設定するアップセル・クロスセル(旧仕様)
            if (content?.upsellProductId) ids.push(content.upsellProductId);
            if (content?.crossSellProductId) ids.push(content.crossSellProductId);
            // 商品提示ノードの商品ごとのアップセル・クロスセル。ここで拾わないと
            // ウィジェット側で商品情報が見つからず、提案が表示されない
            for (const entry of Object.values(content?.productUpsell ?? {})) {
              if (entry?.upsellProductId) ids.push(entry.upsellProductId);
              if (entry?.crossSellProductId) ids.push(entry.crossSellProductId);
            }
            return ids;
          })
          .filter((id): id is string => Boolean(id)),
        // クーポンの対象商品(他のノードで一度も使われていなくても、クーポン対象商品提示のために取得する)
        ...((coupon?.target_product_ids as string[] | null) ?? []),
      ]),
    );

    let productRows: (typeof products.$inferSelect)[] = [];
    if (productIds.length > 0) {
      productRows = await db.select().from(products).where(inArray(products.id, productIds));
    }

    let widgetProducts = productRows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      list_price: p.listPrice,
      first_time_price: p.firstTimePrice,
      compare_price_type: p.comparePriceType,
      unit_total_price: p.unitTotalPrice,
      custom_compare_label: p.customCompareLabel,
      custom_compare_price: p.customComparePrice,
      price_label: p.priceLabel,
      shipping_fee: p.shippingFee,
      is_mail_deliverable: p.isMailDeliverable,
      image_url: p.imageUrl,
      image_urls: p.imageUrls,
      order_type: p.orderType,
      subscription_intervals: sanitizeSubscriptionIntervals(p.subscriptionIntervals),
      is_set: p.isSet,
      set_item_count: p.setItemCount,
    }));

    // より取り品番(構成数の分だけ内訳を選ばせる商品)の選択肢を、対象商品にまとめて付与する
    const setProductIds = productRows.filter((p) => p.isSet).map((p) => p.id);
    if (setProductIds.length > 0) {
      const optionRows = await db
        .select({
          productId: productSetOptions.productId,
          optionId: products.id,
          optionName: products.name,
          optionImageUrl: products.imageUrl,
        })
        .from(productSetOptions)
        .innerJoin(products, eq(productSetOptions.optionProductId, products.id))
        .where(inArray(productSetOptions.productId, setProductIds))
        .orderBy(asc(productSetOptions.displayOrder));

      const optionsByProduct: Record<string, { id: string; name: string; image_url: string | null }[]> = {};
      for (const row of optionRows) {
        (optionsByProduct[row.productId] ??= []).push({
          id: row.optionId,
          name: row.optionName,
          image_url: row.optionImageUrl,
        });
      }
      widgetProducts = widgetProducts.map((p) => ({
        ...p,
        set_options: p.is_set ? (optionsByProduct[p.id] ?? []) : [],
      }));
    } else {
      widgetProducts = widgetProducts.map((p) => ({ ...p, set_options: [] }));
    }

    const menuItemRows = await db
      .select({
        id: scenarioMenuItems.id,
        scenarioId: scenarioMenuItems.scenarioId,
        label: scenarioMenuItems.label,
        actionType: scenarioMenuItems.actionType,
        targetNodeId: scenarioMenuItems.targetNodeId,
        url: scenarioMenuItems.url,
        displayOrder: scenarioMenuItems.displayOrder,
      })
      .from(scenarioMenuItems)
      .where(eq(scenarioMenuItems.scenarioId, scenario.id))
      .orderBy(asc(scenarioMenuItems.displayOrder));

    return NextResponse.json({
      scenario: {
        id: scenario.id,
        name: scenario.name,
        status: scenario.status,
        version: scenario.version,
        created_by: scenario.createdBy,
        created_at: scenario.createdAt,
        updated_at: scenario.updatedAt,
        display_order: scenario.displayOrder,
        slug: scenario.slug,
        order_code: scenario.orderCode,
        chat_background_color: scenario.chatBackgroundColor,
        menu_background_color: scenario.menuBackgroundColor,
        message_background_color: scenario.messageBackgroundColor,
        header_mode: scenario.headerMode,
        header_image_url: scenario.headerImageUrl,
        header_title: scenario.headerTitle,
        header_background_color: scenario.headerBackgroundColor,
        user_message_background_color: scenario.userMessageBackgroundColor,
        header_text_color: scenario.headerTextColor,
        message_text_color: scenario.messageTextColor,
        user_message_text_color: scenario.userMessageTextColor,
        menu_text_color: scenario.menuTextColor,
        ad_tag: scenario.adTag,
        popup_icon_url: scenario.popupIconUrl,
        popup_position: scenario.popupPosition,
        coupon_code_field_enabled: scenario.couponCodeFieldEnabled,
        conversion_tag: scenario.conversionTag,
        email_from_address: scenario.emailFromAddress,
        inquiry_receive_email: scenario.inquiryReceiveEmail,
        inquiry_auto_reply_from: scenario.inquiryAutoReplyFrom,
        order_confirmation_from: scenario.orderConfirmationFrom,
        abandoned_reminder_from: scenario.abandonedReminderFrom,
        cancellation_from: scenario.cancellationFrom,
        shipment_complete_from: scenario.shipmentCompleteFrom,
        menu_layout_key: scenario.menuLayoutKey,
        menu_image_url: scenario.menuImageUrl,
        popup_button_text: scenario.popupButtonText,
      },
      nodes: nodeRows.map((n) => ({
        id: n.id,
        scenario_id: n.scenarioId,
        type: n.type,
        content: n.content,
        next_node_map: n.nextNodeMap,
        is_entry: n.isEntry,
        display_order: n.displayOrder,
        created_at: n.createdAt,
      })),
      products: widgetProducts,
      menuItems: menuItemRows.map((m) => ({
        id: m.id,
        scenario_id: m.scenarioId,
        label: m.label,
        action_type: m.actionType,
        target_node_id: m.targetNodeId,
        url: m.url,
        display_order: m.displayOrder,
      })),
      coupon,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
