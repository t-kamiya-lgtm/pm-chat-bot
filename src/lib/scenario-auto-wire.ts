import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * 決済導線ノードの基準品番(content.productId)を、同シナリオ内の商品提示ノードのうち
 * その品番を含み、かつまだ次のノードが未設定のものへ自動配線する。
 * 管理画面でアップセル/クロスセルを選ぶたびに手動で商品提示ノード側の配線をやり直す
 * 手間を省くための補助であり、既に手動配線済み(次のノードが設定済み)の場合は上書きしない。
 */
export async function autoWireCheckoutNode(
  supabase: SupabaseAdminClient,
  scenarioId: string,
  checkoutNodeId: string,
  productId: string | undefined,
): Promise<void> {
  if (!productId) return;

  const { data: productNodes } = await supabase
    .from("scenario_nodes")
    .select("id, content, next_node_map")
    .eq("scenario_id", scenarioId)
    .eq("type", "product");

  for (const node of productNodes ?? []) {
    const content = node.content as { productIds?: string[] };
    if (!Array.isArray(content.productIds) || !content.productIds.includes(productId)) continue;

    const nextNodeMap = (node.next_node_map ?? {}) as Record<string, string>;
    if (nextNodeMap[productId]) continue;

    await supabase
      .from("scenario_nodes")
      .update({ next_node_map: { ...nextNodeMap, [productId]: checkoutNodeId } })
      .eq("id", node.id);
  }
}
