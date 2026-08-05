import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const menuItemUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  actionType: z.enum(["node", "url"]).optional(),
  targetNodeId: z.string().uuid().nullable().optional(),
  url: z.string().url().nullable().optional(),
  displayOrder: z.number().int().optional(),
});

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, itemId } = await params;

  const body = await request.json();
  const parsed = menuItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("scenario_menu_items")
    .update({
      ...(input.label !== undefined && { label: input.label }),
      ...(input.actionType !== undefined && { action_type: input.actionType }),
      ...(input.targetNodeId !== undefined && { target_node_id: input.targetNodeId }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.displayOrder !== undefined && { display_order: input.displayOrder }),
    })
    .eq("id", itemId)
    .eq("scenario_id", scenarioId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ menuItem: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId, itemId } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("scenario_menu_items")
    .delete()
    .eq("id", itemId)
    .eq("scenario_id", scenarioId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
