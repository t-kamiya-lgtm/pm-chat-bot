import { NextResponse } from "next/server";
import { z } from "zod";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads, orders, productSetOptions, products } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { toAdminErrorMessage } from "@/lib/api-error";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productUpdateSchema = z.object({
  productGroupId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  memo: z.string().nullable().optional(),
  price: z.number().int().min(0).optional(),
  listPrice: z.number().int().min(0).nullable().optional(),
  firstTimePrice: z.number().int().min(0).nullable().optional(),
  nextCycleProductId: z.string().uuid().nullable().optional(),
  nextCycleInterval: subscriptionIntervalSchema.nullable().optional(),
  comparePriceType: z.enum(["none", "list_price", "unit_total", "custom"]).optional(),
  unitTotalPrice: z.number().int().min(0).nullable().optional(),
  customCompareLabel: z.string().nullable().optional(),
  customComparePrice: z.number().int().min(0).nullable().optional(),
  priceLabel: z.string().nullable().optional(),
  taxRate: z.union([z.literal(8), z.literal(10)]).optional(),
  shippingFee: z.number().int().min(0).optional(),
  costAmount: z.number().int().min(0).optional(),
  bundleInsertCost: z.number().int().min(0).optional(),
  shippingCost: z.number().int().min(0).optional(),
  salesCommissionAmount: z.number().int().min(0).optional(),
  isMailDeliverable: z.boolean().optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  smaregiProductId: z.string().optional(),
  orderType: z.enum(["one_time", "subscription"]).optional(),
  subscriptionIntervals: z.array(subscriptionIntervalSchema).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  isSet: z.boolean().optional(),
  setItemCount: z.number().int().min(1).nullable().optional(),
  setOptionProductIds: z.array(z.string().uuid()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ product: row });
  } catch (err) {
    return NextResponse.json({ error: toAdminErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (input.isSet && input.setOptionProductIds !== undefined) {
    if (!input.setItemCount || input.setOptionProductIds.length === 0) {
      return NextResponse.json(
        { error: "より取り品番は、セット構成数と、選択肢の商品を1つ以上登録してください" },
        { status: 400 },
      );
    }
  }

  try {
    const db = await getDb();

    const [row] = await db
      .update(products)
      .set({
        ...(input.productGroupId !== undefined && { productGroupId: input.productGroupId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.memo !== undefined && { memo: input.memo }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.listPrice !== undefined && { listPrice: input.listPrice }),
        ...(input.firstTimePrice !== undefined && { firstTimePrice: input.firstTimePrice }),
        ...(input.nextCycleProductId !== undefined && { nextCycleProductId: input.nextCycleProductId }),
        ...(input.nextCycleInterval !== undefined && { nextCycleInterval: input.nextCycleInterval }),
        ...(input.comparePriceType !== undefined && { comparePriceType: input.comparePriceType }),
        ...(input.unitTotalPrice !== undefined && { unitTotalPrice: input.unitTotalPrice }),
        ...(input.customCompareLabel !== undefined && { customCompareLabel: input.customCompareLabel }),
        ...(input.customComparePrice !== undefined && { customComparePrice: input.customComparePrice }),
        ...(input.priceLabel !== undefined && { priceLabel: input.priceLabel }),
        ...(input.taxRate !== undefined && { taxRate: input.taxRate }),
        ...(input.shippingFee !== undefined && { shippingFee: input.shippingFee }),
        ...(input.costAmount !== undefined && { costAmount: input.costAmount }),
        ...(input.bundleInsertCost !== undefined && { bundleInsertCost: input.bundleInsertCost }),
        ...(input.shippingCost !== undefined && { shippingCost: input.shippingCost }),
        ...(input.salesCommissionAmount !== undefined && { salesCommissionAmount: input.salesCommissionAmount }),
        ...(input.isMailDeliverable !== undefined && { isMailDeliverable: input.isMailDeliverable }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.imageUrls !== undefined && {
          imageUrls: input.imageUrls,
          imageUrl: input.imageUrls[0] ?? null,
        }),
        ...(input.smaregiProductId !== undefined && { smaregiProductId: input.smaregiProductId }),
        ...(input.orderType !== undefined && { orderType: input.orderType }),
        ...(input.subscriptionIntervals !== undefined && {
          subscriptionIntervals: input.subscriptionIntervals,
        }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.isSet !== undefined && { isSet: input.isSet }),
        ...(input.setItemCount !== undefined && { setItemCount: input.isSet === false ? null : input.setItemCount }),
      })
      .where(eq(products.id, id))
      .returning();

    if (input.setOptionProductIds !== undefined) {
      await db.delete(productSetOptions).where(eq(productSetOptions.productId, id));
      if (input.setOptionProductIds.length > 0) {
        await db.insert(productSetOptions).values(
          input.setOptionProductIds.map((optionProductId, index) => ({
            productId: id,
            optionProductId,
            displayOrder: index,
          })),
        );
      }
    }

    return NextResponse.json({ product: row });
  } catch (err) {
    return NextResponse.json({ error: toAdminErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();

    // 注文で使用済みの品番は外部キー制約で削除できない(注文履歴が壊れるため)。
    // 削除前に判定し、アーカイブを促す分かりやすいエラーを返す(でないと削除に失敗しても
    // 画面上は削除できたように見えてしまい、再読み込みで復活したように見える)。
    const [[{ value: orderCount }], [{ value: addonCount }], [{ value: leadCount }]] = await Promise.all([
      db.select({ value: count() }).from(orders).where(eq(orders.productId, id)),
      db.select({ value: count() }).from(orders).where(eq(orders.addonProductId, id)),
      db.select({ value: count() }).from(leads).where(eq(leads.productId, id)),
    ]);
    if (orderCount > 0 || addonCount > 0) {
      return NextResponse.json(
        { error: "この品番は注文で使用されているため削除できません。代わりに「アーカイブ」で一覧から隠せます。" },
        { status: 409 },
      );
    }
    // アクセスログ(leads)が残っている品番も、閲覧履歴の分析データが壊れないよう削除をブロックする。
    // 不要なテストデータの場合は、先にアクセスログ側を削除してから品番を削除する。
    if (leadCount > 0) {
      return NextResponse.json(
        {
          error:
            "この品番は閲覧履歴(アクセスログ)が残っているため削除できません。アクセスログを削除するか、代わりに「アーカイブ」で一覧から隠せます。",
        },
        { status: 409 },
      );
    }

    await db.delete(products).where(eq(products.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: toAdminErrorMessage(String(err)) }, { status: 500 });
  }
}
