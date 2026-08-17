import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Product, ProductOrderType } from "@/lib/types";

export interface ProductRow {
  id: string;
  product_group_id: string | null;
  name: string;
  description: string | null;
  price: number;
  list_price: number | null;
  first_time_price: number | null;
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
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  return data as ProductRow | null;
}
