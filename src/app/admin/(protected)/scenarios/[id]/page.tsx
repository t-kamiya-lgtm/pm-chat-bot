import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ScenarioEditor } from "@/components/admin/ScenarioEditor";
import type { ScenarioNode } from "@/lib/types";

export const dynamic = "force-dynamic";

function extractGroupName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  return (row as { name?: string } | null)?.name ?? null;
}

function mapNodeRow(row: Record<string, unknown>): ScenarioNode {
  return {
    id: row.id as string,
    scenarioId: row.scenario_id as string,
    type: row.type as ScenarioNode["type"],
    content: row.content as Record<string, unknown>,
    nextNodeMap: row.next_node_map as Record<string, string>,
    isEntry: row.is_entry as boolean,
    displayOrder: (row.display_order as number | null) ?? 0,
    createdAt: row.created_at as string,
  };
}

export default async function ScenarioEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const [{ data: scenario }, { data: nodes }, { data: products, error: productsError }] = await Promise.all([
    supabase.from("scenarios").select("*").eq("id", id).maybeSingle(),
    supabase.from("scenario_nodes").select("*").eq("scenario_id", id).order("display_order"),
    supabase
      .from("products")
      .select("id, name, price, order_type, product_group_id, product_groups(name)")
      .order("created_at", { ascending: false }),
  ]);

  if (!scenario) notFound();

  return (
    <div>
      {productsError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          品番一覧の取得に失敗しました({productsError.message})。品番の選択・アップセル/クロスセルの設定ができません。
        </p>
      )}
      <ScenarioEditor
        scenario={{
          id: scenario.id,
          name: scenario.name,
          status: scenario.status,
          version: scenario.version,
          createdBy: scenario.created_by,
          createdAt: scenario.created_at,
          updatedAt: scenario.updated_at,
        }}
        nodes={(nodes ?? []).map(mapNodeRow)}
        products={(products ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          price: p.price as number,
          orderType: p.order_type as "one_time" | "subscription",
          productGroupId: p.product_group_id as string | null,
          productGroupName: extractGroupName(p.product_groups),
        }))}
      />
    </div>
  );
}
