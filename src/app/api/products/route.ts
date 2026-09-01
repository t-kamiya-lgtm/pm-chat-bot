import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products, productSetOptions } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { toAdminErrorMessage } from "@/lib/api-error";
import { subscriptionIntervalSchema } from "@/lib/checkout-schema";

const productInputSchema = z.object({
  productGroupId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  memo: z.string().nullable().optional(),
  price: z.number().int().min(0),
  listPrice: z.number().int().min(0).nullable().optional(),
  firstTimePrice: z.number().int().min(0).nullable().optional(),
  nextCycleProductId: z.string().uuid().nullable().optional(),
  nextCycleInterval: subscriptionIntervalSchema.nullable().optional(),
  comparePriceType: z.enum(["none", "list_price", "unit_total", "custom"]).default("none"),
  unitTotalPrice: z.number().int().min(0).nullable().optional(),
  customCompareLabel: z.string().nullable().optional(),
  customComparePrice: z.number().int().min(0).nullable().optional(),
  priceLabel: z.string().nullable().optional(),
  taxRate: z.union([z.literal(8), z.literal(10)]).default(8),
  shippingFee: z.number().int().min(0).default(0),
  costAmount: z.number().int().min(0).default(0),
  bundleInsertCost: z.number().int().min(0).default(0),
  shippingCost: z.number().int().min(0).default(0),
  salesCommissionAmount: z.number().int().min(0).default(0),
  isMailDeliverable: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).default([]),
  smaregiProductId: z.string().optional(),
  orderType: z.enum(["one_time", "subscription"]),
  subscriptionIntervals: z.array(subscriptionIntervalSchema).default([]),
  isSet: z.boolean().default(false),
  setItemCount: z.number().int().min(1).nullable().optional(),
  setOptionProductIds: z.array(z.string().uuid()).default([]),
});

export async function GET(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const productGroupId = searchParams.get("productGroupId");

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(products)
      .where(productGroupId ? eq(products.productGroupId, productGroupId) : undefined)
      .orderBy(asc(products.displayOrder));
    return NextResponse.json({ products: rows });
  } catch (err) {
    return NextResponse.json({ error: toAdminErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  if (input.orderType === "subscription" && input.subscriptionIntervals.length === 0) {
    return NextResponse.json(
      { error: "subscriptionIntervals is required when orderType is subscription" },
      { status: 400 },
    );
  }
  if (input.isSet && (!input.setItemCount || input.setOptionProductIds.length === 0)) {
    return NextResponse.json(
      { error: "より取り品番は、セット構成数と、選択肢の商品を1つ以上登録してください" },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();

    const [lastProduct] = await db
      .select({ displayOrder: products.displayOrder })
      .from(products)
      .orderBy(desc(products.displayOrder))
      .limit(1);
    const displayOrder = (lastProduct?.displayOrder ?? -1) + 1;

    const [row] = await db
      .insert(products)
      .values({
        productGroupId: input.productGroupId,
        displayOrder,
        name: input.name,
        description: input.description ?? null,
        memo: input.memo ?? null,
        price: input.price,
        listPrice: input.listPrice ?? null,
        firstTimePrice: input.orderType === "subscription" ? (input.firstTimePrice ?? null) : null,
        nextCycleProductId: input.orderType === "subscription" ? (input.nextCycleProductId ?? null) : null,
        nextCycleInterval: input.orderType === "subscription" ? (input.nextCycleInterval ?? null) : null,
        comparePriceType: input.comparePriceType,
        unitTotalPrice: input.unitTotalPrice ?? null,
        customCompareLabel: input.customCompareLabel ?? null,
        customComparePrice: input.customComparePrice ?? null,
        priceLabel: input.priceLabel ?? null,
        taxRate: input.taxRate,
        shippingFee: input.shippingFee,
        costAmount: input.costAmount,
        bundleInsertCost: input.bundleInsertCost,
        shippingCost: input.shippingCost,
        salesCommissionAmount: input.salesCommissionAmount,
        isMailDeliverable: input.isMailDeliverable,
        imageUrl: input.imageUrls[0] ?? input.imageUrl ?? null,
        imageUrls: input.imageUrls,
        smaregiProductId: input.smaregiProductId ?? null,
        orderType: input.orderType,
        subscriptionIntervals: input.orderType === "subscription" ? input.subscriptionIntervals : [],
        isSet: input.isSet,
        setItemCount: input.isSet ? input.setItemCount : null,
        createdBy: roleCheck.user.id,
      })
      .returning();

    if (input.isSet && input.setOptionProductIds.length > 0) {
      await db.insert(productSetOptions).values(
        input.setOptionProductIds.map((optionProductId, index) => ({
          productId: row.id,
          optionProductId,
          displayOrder: index,
        })),
      );
    }

    return NextResponse.json({ product: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: toAdminErrorMessage(String(err)) }, { status: 500 });
  }
}
