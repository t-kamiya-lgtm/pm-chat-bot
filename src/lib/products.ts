import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products } from "@/db/schema";
import type { Product, ProductOrderType } from "@/lib/types";

export interface ProductRow {
  id: string;
  product_group_id: string | null;
  name: string;
  description: string | null;
  price: number;
  list_price: number | null;
  first_time_price: number | null;
  next_cycle_product_id: string | null;
  next_cycle_interval: Product["subscriptionIntervals"][number] | null;
  compare_price_type: "none" | "list_price" | "unit_total" | "custom";
  unit_total_price: number | null;
  custom_compare_label: string | null;
  custom_compare_price: number | null;
  price_label: string | null;
  shipping_fee: number;
  image_url: string | null;
  image_urls: string[];
  smaregi_product_id: string | null;
  order_type: ProductOrderType;
  subscription_intervals: Product["subscriptionIntervals"];
  stripe_product_id: string | null;
  stripe_price_id: string | null;
}

export async function getProductById(productId: string): Promise<ProductRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    product_group_id: row.productGroupId,
    name: row.name,
    description: row.description,
    price: row.price,
    list_price: row.listPrice,
    first_time_price: row.firstTimePrice,
    next_cycle_product_id: row.nextCycleProductId,
    next_cycle_interval: row.nextCycleInterval as Product["subscriptionIntervals"][number] | null,
    compare_price_type: row.comparePriceType as ProductRow["compare_price_type"],
    unit_total_price: row.unitTotalPrice,
    custom_compare_label: row.customCompareLabel,
    custom_compare_price: row.customComparePrice,
    price_label: row.priceLabel,
    shipping_fee: row.shippingFee,
    image_url: row.imageUrl,
    image_urls: row.imageUrls,
    smaregi_product_id: row.smaregiProductId,
    order_type: row.orderType as ProductOrderType,
    subscription_intervals: row.subscriptionIntervals as Product["subscriptionIntervals"],
    stripe_product_id: row.stripeProductId,
    stripe_price_id: row.stripePriceId,
  };
}
