import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { autoWireCheckoutNode } from "@/lib/scenario-auto-wire";

const nodeSchema = z.object({
  type: z.enum(["message", "choice", "product", "checkout", "product_qa"]),
  content: z.record(z.string(), z.unknown()).default({}),
  nextNodeMap: z.record(z.string(), z.string()).default({}),
  isEntry: z.boolean().default(false),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId } = await params;

  const body = await request.json();
  const parsed = nodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();

  if (input.isEntry) {
    // シナリオごとにエントリーノードは1つのみにする
    await supabase
      .from("scenario_nodes")
      .update({ is_entry: false })
      .eq("scenario_id", scenarioId)
      .eq("is_entry", true);
  }

  const { data, error } = await supabase
    .from("scenario_nodes")
    .insert({
      scenario_id: scenarioId,
      type: input.type,
      content: input.content,
      next_node_map: input.nextNodeMap,
      is_entry: input.isEntry,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data.type === "checkout") {
    const content = data.content as { productId?: string };
    await autoWireCheckoutNode(supabase, scenarioId, data.id, content.productId);
  }

  return NextResponse.json({ node: data }, { status: 201 });
}
