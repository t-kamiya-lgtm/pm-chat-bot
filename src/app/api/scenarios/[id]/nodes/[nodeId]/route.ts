import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { autoWireCheckoutNode } from "@/lib/scenario-auto-wire";

const nodeUpdateSchema = z.object({
  type: z.enum(["message", "choice", "product", "checkout", "product_qa"]).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  nextNodeMap: z.record(z.string(), z.string()).optional(),
  isEntry: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string; nodeId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, nodeId } = await params;

  const body = await request.json();
  const parsed = nodeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();

  if (input.isEntry) {
    await supabase
      .from("scenario_nodes")
      .update({ is_entry: false })
      .eq("scenario_id", scenarioId)
      .eq("is_entry", true);
  }

  const { data, error } = await supabase
    .from("scenario_nodes")
    .update({
      ...(input.type !== undefined && { type: input.type }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.nextNodeMap !== undefined && { next_node_map: input.nextNodeMap }),
      ...(input.isEntry !== undefined && { is_entry: input.isEntry }),
    })
    .eq("id", nodeId)
    .eq("scenario_id", scenarioId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data.type === "checkout") {
    const content = data.content as { productId?: string };
    await autoWireCheckoutNode(supabase, scenarioId, data.id, content.productId);
  }

  return NextResponse.json({ node: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, nodeId } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("scenario_nodes")
    .delete()
    .eq("id", nodeId)
    .eq("scenario_id", scenarioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
