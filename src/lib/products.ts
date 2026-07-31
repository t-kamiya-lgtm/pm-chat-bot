import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Product } from "@/lib/types";

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  shipping_fee: number;
  image_url: string | null;
  smaregi_product_id: string | null;
  is_subscription_available: boolean;
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
