import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface ProductUpsellEntry {
  upsellProductId?: string;
  upsellImageUrl?: string;
  upsellComment?: string;
  crossSellProductId?: string;
  crossSellImageUrl?: string;
  crossSellComment?: string;
}

interface CheckoutContent {
  productId?: string;
  upsellProductId?: string;
  upsellImageUrl?: string;
  upsellComment?: string;
  crossSellProductId?: string;
  crossSellImageUrl?: string;
  crossSellComment?: string;
}

/**
 * 廃止した決済導線ノードのアップセル・クロスセル設定を、対象品番を扱う商品提示ノードの
 * content.productUpsell へ退避する。
 * 決済導線ノードを削除すると設定が失われてしまうため、削除の直前に必ず呼ぶ。
 * 商品提示ノード側に既に設定がある品番は上書きしない(管理画面で入力した内容を優先する)。
 */
export async function migrateCheckoutUpsellToProductNodes(
  supabase: SupabaseAdminClient,
  scenarioId: string,
  checkoutNodeId: string,
): Promise<void> {
  const { data: checkoutNode } = await supabase
    .from("scenario_nodes")
    .select("id, type, content")
    .eq("id", checkoutNodeId)
    .eq("scenario_id", scenarioId)
    .maybeSingle();

  if (!checkoutNode || checkoutNode.type !== "checkout") return;

  const content = checkoutNode.content as CheckoutContent;
  const productId = content.productId;
  if (!productId) return;
  if (!content.upsellProductId && !content.crossSellProductId) return;

  const entry: ProductUpsellEntry = {
    ...(content.upsellProductId && { upsellProductId: content.upsellProductId }),
    ...(content.upsellImageUrl && { upsellImageUrl: content.upsellImageUrl }),
    ...(content.upsellComment && { upsellComment: content.upsellComment }),
    ...(content.crossSellProductId && { crossSellProductId: content.crossSellProductId }),
    ...(content.crossSellImageUrl && { crossSellImageUrl: content.crossSellImageUrl }),
    ...(content.crossSellComment && { crossSellComment: content.crossSellComment }),
  };

  const { data: productNodes } = await supabase
    .from("scenario_nodes")
    .select("id, content")
    .eq("scenario_id", scenarioId)
    .eq("type", "product");

  for (const node of productNodes ?? []) {
    const nodeContent = node.content as {
      productIds?: string[];
      productUpsell?: Record<string, ProductUpsellEntry>;
    };
    if (!Array.isArray(nodeContent.productIds) || !nodeContent.productIds.includes(productId)) continue;
    if (nodeContent.productUpsell?.[productId]) continue;

    await supabase
      .from("scenario_nodes")
      .update({
        content: {
          ...nodeContent,
          productUpsell: { ...(nodeContent.productUpsell ?? {}), [productId]: entry },
        },
      })
      .eq("id", node.id);
  }
}
