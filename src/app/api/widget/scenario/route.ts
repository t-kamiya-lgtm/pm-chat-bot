import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
              .map((v) => v.slice(QA_TARGET_PREFIX.length));
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
    products = data ?? [];
  }

  const { data: menuItems, error: menuItemsError } = await supabase
    .from("scenario_menu_items")
    .select("id, scenario_id, label, action_type, target_node_id, url, display_order")
    .eq("scenario_id", scenario.id)
    .order("display_order");
  if (menuItemsError) return NextResponse.json({ error: menuItemsError.message }, { status: 500 });

  return NextResponse.json({ scenario, nodes, products, menuItems: menuItems ?? [] });
}
