import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const menuItemSchema = z
  .object({
    label: z.string().min(1),
    actionType: z.enum(["node", "url", "business_calendar", "shopping_guide"]),
    targetNodeId: z.string().uuid().optional(),
    url: z.string().url().optional(),
  })
  .refine(
    (v) => {
      if (v.actionType === "node") return !!v.targetNodeId;
      if (v.actionType === "url") return !!v.url;
      return true;
    },
    { message: "actionTypeがnodeの場合はtargetNodeId、urlの場合はurlが必要です" },
  );

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId } = await params;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("scenario_menu_items")
    .select("*")
    .eq("scenario_id", scenarioId)
    .order("display_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ menuItems: data });
}

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: scenarioId } = await params;

  const body = await request.json();
  const parsed = menuItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();

  const { data: lastItem } = await supabase
    .from("scenario_menu_items")
    .select("display_order")
    .eq("scenario_id", scenarioId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayOrder = (lastItem?.display_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("scenario_menu_items")
    .insert({
      scenario_id: scenarioId,
      label: input.label,
      action_type: input.actionType,
      target_node_id: input.actionType === "node" ? input.targetNodeId : null,
      url: input.actionType === "url" ? input.url : null,
      display_order: displayOrder,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ menuItem: data }, { status: 201 });
}
