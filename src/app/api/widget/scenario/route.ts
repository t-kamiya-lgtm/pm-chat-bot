import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const supabase = createSupabaseAdminClient();

  const scenarioQuery = supabase
    .from("scenarios")
    .select("*")
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  let scenarioResult;
  if (scenarioId && isPreview) {
    // 管理画面からのプレビュー用: 下書きでも指定IDのシナリオをそのまま表示する
    scenarioResult = await supabase.from("scenarios").select("*").eq("id", scenarioId).maybeSingle();
  } else if (scenarioId) {
    scenarioResult = await supabase
      .from("scenarios")
      .select("*")
      .eq("id", scenarioId)
      .eq("status", "published")
      .maybeSingle();
  } else if (slug) {
    // ブランド・商品ごとに発行した専用URL(/widget/<slug>)からの公開アクセス
    scenarioResult = await supabase
      .from("scenarios")
      .select("*")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
  } else {
    scenarioResult = await scenarioQuery.limit(1).maybeSingle();
  }
  const { data: scenario, error: scenarioError } = scenarioResult;

  if (scenarioError) return NextResponse.json({ error: scenarioError.message }, { status: 500 });
  if (!scenario) return NextResponse.json({ error: "no published scenario" }, { status: 404 });

  // memoは管理用メモのため、チャットボット側には一切送らない
  const { data: nodes, error: nodesError } = await supabase
    .from("scenario_nodes")
    .select("id, scenario_id, type, content, next_node_map, is_entry, display_order, created_at")
    .eq("scenario_id", scenario.id)
    .order("display_order");
  if (nodesError) return NextResponse.json({ error: nodesError.message }, { status: 500 });

  const QA_TARGET_PREFIX = "qa:";

  const productIds = Array.from(
    new Set(
      (nodes ?? [])
        .flatMap((n) => {
          if (n.type === "choice") {
            // 選択肢分岐ノードの「その場でQ&Aを表示する」設定(next_node_mapのsentinel値)から商品IDを拾う
            return Object.values(n.next_node_map as Record<string, string>)
              .filter((v) => v.startsWith(QA_TARGET_PREFIX))
              .map((v) => v.slice(QA_TARGET_PREFIX.length).split("|")[0]);
          }
          if (n.type !== "product" && n.type !== "checkout" && n.type !== "product_qa") return [];
          const content = n.content as {
            productId?: string;
            productIds?: string[];
            upsellProductId?: string;
            crossSellProductId?: string;
          };
          const ids = Array.isArray(content?.productIds)
            ? [...content.productIds]
            : content?.productId
              ? [content.productId]
              : [];
          if (content?.upsellProductId) ids.push(content.upsellProductId);
          if (content?.crossSellProductId) ids.push(content.crossSellProductId);
          return ids;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let products: Record<string, unknown>[] = [];
  if (productIds.length > 0) {
    const { data, error } = await supabase.from("products").select("*").in("id", productIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    products = (data ?? []).map((p) => ({
      ...p,
      subscription_intervals: sanitizeSubscriptionIntervals(p.subscription_intervals),
    }));
  }

  // セット品(構成数の分だけ内訳を選ばせる商品)の選択肢を、対象商品にまとめて付与する
  const setProductIds = products.filter((p) => p.is_set).map((p) => p.id as string);
  if (setProductIds.length > 0) {
    const { data: setOptionRows, error: setOptionsError } = await supabase
      .from("product_set_options")
      .select("product_id, option_product_id, display_order, products!option_product_id(id, name, image_url)")
      .in("product_id", setProductIds)
      .order("display_order", { ascending: true });
    if (setOptionsError) return NextResponse.json({ error: setOptionsError.message }, { status: 500 });

    const optionsByProduct: Record<string, { id: string; name: string; image_url: string | null }[]> = {};
    for (const row of setOptionRows ?? []) {
      const joined = row.products as unknown;
      const option = (Array.isArray(joined) ? joined[0] : joined) as
        | { id: string; name: string; image_url: string | null }
        | null;
      if (!option) continue;
      (optionsByProduct[row.product_id as string] ??= []).push(option);
    }
    products = products.map((p) => ({ ...p, set_options: p.is_set ? (optionsByProduct[p.id as string] ?? []) : [] }));
  } else {
    products = products.map((p) => ({ ...p, set_options: [] }));
  }

  const { data: menuItems, error: menuItemsError } = await supabase
    .from("scenario_menu_items")
    .select("id, scenario_id, label, action_type, target_node_id, url, display_order")
    .eq("scenario_id", scenario.id)
    .order("display_order");
  if (menuItemsError) return NextResponse.json({ error: menuItemsError.message }, { status: 500 });

  // クーポン表示ノードは、シナリオの自動適用クーポン(scenario_auto)の告知内容をそのまま表示する
  let coupon: Record<string, unknown> | null = null;
  if ((nodes ?? []).some((n) => n.type === "coupon")) {
    const { data, error } = await supabase
      .from("coupons")
      .select("code, name, discount_type, discount_value, image_url, promo_message, is_active")
      .eq("scenario_id", scenario.id)
      .eq("type", "scenario_auto")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    coupon = data && data.is_active ? data : null;
  }

  return NextResponse.json({ scenario, nodes, products, menuItems: menuItems ?? [], coupon });
}
