import { and, eq } from "drizzle-orm";
import { scenarioNodes } from "@/db/schema";
import type { Db } from "@/lib/db";

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
  db: Db,
  scenarioId: string,
  checkoutNodeId: string,
): Promise<void> {
  const [checkoutNode] = await db
    .select({ id: scenarioNodes.id, type: scenarioNodes.type, content: scenarioNodes.content })
    .from(scenarioNodes)
    .where(and(eq(scenarioNodes.id, checkoutNodeId), eq(scenarioNodes.scenarioId, scenarioId)))
    .limit(1);

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

  const productNodes = await db
    .select({ id: scenarioNodes.id, content: scenarioNodes.content })
    .from(scenarioNodes)
    .where(and(eq(scenarioNodes.scenarioId, scenarioId), eq(scenarioNodes.type, "product")));

  for (const node of productNodes) {
    const nodeContent = node.content as {
      productIds?: string[];
      productUpsell?: Record<string, ProductUpsellEntry>;
    };
    if (!Array.isArray(nodeContent.productIds) || !nodeContent.productIds.includes(productId)) continue;
    if (nodeContent.productUpsell?.[productId]) continue;

    await db
      .update(scenarioNodes)
      .set({
        content: {
          ...nodeContent,
          productUpsell: { ...(nodeContent.productUpsell ?? {}), [productId]: entry },
        },
      })
      .where(eq(scenarioNodes.id, node.id));
  }
}
