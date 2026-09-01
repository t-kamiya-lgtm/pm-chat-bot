import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productSetOptions, products } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { toAdminErrorMessage } from "@/lib/api-error";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 品番の複製。商品コード(旧スマレジ品番)は複製先にもそのまま引き継ぐ
 * (同じ商品コードのまま初回価格だけ変えたオファーパターンをテストできるようにするため。
 * 重複登録を防ぐ制約は廃止済み)。
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();

    const [source] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

    const [lastProduct] = await db
      .select({ displayOrder: products.displayOrder })
      .from(products)
      .orderBy(desc(products.displayOrder))
      .limit(1);
    const displayOrder = (lastProduct?.displayOrder ?? -1) + 1;

    const [row] = await db
      .insert(products)
      .values({
        productGroupId: source.productGroupId,
        displayOrder,
        name: `${source.name}(コピー)`,
        description: source.description,
        memo: source.memo,
        price: source.price,
        listPrice: source.listPrice,
        firstTimePrice: source.firstTimePrice,
        nextCycleProductId: source.nextCycleProductId,
        nextCycleInterval: source.nextCycleInterval,
        comparePriceType: source.comparePriceType,
        unitTotalPrice: source.unitTotalPrice,
        customCompareLabel: source.customCompareLabel,
        customComparePrice: source.customComparePrice,
        priceLabel: source.priceLabel,
        taxRate: source.taxRate,
        shippingFee: source.shippingFee,
        isMailDeliverable: source.isMailDeliverable,
        imageUrl: source.imageUrl,
        imageUrls: source.imageUrls,
        smaregiProductId: source.smaregiProductId,
        orderType: source.orderType,
        subscriptionIntervals: source.subscriptionIntervals,
        isSet: source.isSet,
        setItemCount: source.setItemCount,
        createdBy: roleCheck.user.id,
      })
      .returning();

    if (source.isSet) {
      const sourceOptions = await db
        .select({ optionProductId: productSetOptions.optionProductId, displayOrder: productSetOptions.displayOrder })
        .from(productSetOptions)
        .where(eq(productSetOptions.productId, id));
      if (sourceOptions.length > 0) {
        await db.insert(productSetOptions).values(
          sourceOptions.map((o) => ({
            productId: row.id,
            optionProductId: o.optionProductId,
            displayOrder: o.displayOrder,
          })),
        );
      }
    }

    return NextResponse.json({ product: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toAdminErrorMessage(String(err)) }, { status: 500 });
  }
}
