import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * チャットウィジェット用の公開エンドポイント(認証不要)。
 * 公開済み(status=published)シナリオのノード一覧と、
 * そのノードが参照する商品情報をまとめて返す。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scenarioId = searchParams.get("id");

  const supabase = createSupabaseAdminClient();

  const scenarioQuery = supabase
    .from("scenarios")
    .select("*")
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  const { data: scenario, error: scenarioError } = scenarioId
    ? await supabase.from("scenarios").select("*").eq("id", scenarioId).eq("status", "published").maybeSingle()
    : await scenarioQuery.limit(1).maybeSingle();

  if (scenarioError) return NextResponse.json({ error: scenarioError.message }, { status: 500 });
  if (!scenario) return NextResponse.json({ error: "no published scenario" }, { status: 404 });

  const { data: nodes, error: nodesError } = await supabase
    .from("scenario_nodes")
    .select("*")
    .eq("scenario_id", scenario.id);
  if (nodesError) return NextResponse.json({ error: nodesError.message }, { status: 500 });

  const productIds = Array.from(
    new Set(
      (nodes ?? [])
        .filter((n) => n.type === "product" || n.type === "checkout" || n.type === "product_qa")
        .map((n) => (n.content as { productId?: string })?.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let products: Record<string, unknown>[] = [];
  if (productIds.length > 0) {
    const { data, error } = await supabase.from("products").select("*").in("id", productIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    products = data ?? [];
  }

  return NextResponse.json({ scenario, nodes, products });
}
