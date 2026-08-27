import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** シナリオコード(英字2文字+数字4桁)の先頭2文字とブランドコードを突き合わせてブランドを判定する。 */
export function resolveScenarioBrandId(
  orderCode: string | null,
  brandCodeToId: Map<string, string>,
): string | null {
  if (!orderCode || orderCode.length < 2) return null;
  return brandCodeToId.get(orderCode.slice(0, 2).toUpperCase()) ?? null;
}

/**
 * 指定した顧客の直近の注文(シナリオ)から、所属ブランドを推定する。
 * 複数ブランドの注文履歴がある顧客は、最新の注文を優先する。
 */
export async function resolveCustomerBrandId(
  supabase: SupabaseAdminClient,
  customerId: string,
): Promise<string | null> {
  const { data: brands } = await supabase.from("brands").select("id, code");
  const brandCodeToId = new Map(
    (brands ?? []).filter((b) => b.code).map((b) => [(b.code as string).toUpperCase(), b.id as string]),
  );
  if (brandCodeToId.size === 0) return null;

  const { data: orders } = await supabase
    .from("orders")
    .select("scenario_id, created_at, scenarios(order_code)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const order of orders ?? []) {
    const orderCode =
      (order as unknown as { scenarios: { order_code: string | null } | null }).scenarios?.order_code ?? null;
    const brandId = resolveScenarioBrandId(orderCode, brandCodeToId);
    if (brandId) return brandId;
  }
  return null;
}
