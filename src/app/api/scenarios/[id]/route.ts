import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["draft", "published"]).optional(),
  displayOrder: z.number().int().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "半角英小文字・数字・ハイフンのみ使用できます")
    .nullable()
    .optional(),
  orderCode: z
    .string()
    .regex(/^[A-Za-z0-9]+$/, "半角英数字のみ使用できます")
    .nullable()
    .optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const [{ data: scenario, error: scenarioError }, { data: nodes, error: nodesError }] =
    await Promise.all([
      supabase.from("scenarios").select("*").eq("id", id).maybeSingle(),
      supabase.from("scenario_nodes").select("*").eq("scenario_id", id),
    ]);

  if (scenarioError) return NextResponse.json({ error: scenarioError.message }, { status: 500 });
  if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (nodesError) return NextResponse.json({ error: nodesError.message }, { status: 500 });

  return NextResponse.json({ scenario, nodes });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("scenarios")
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.displayOrder !== undefined && { display_order: input.displayOrder }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.orderCode !== undefined && { order_code: input.orderCode }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "このURLは既に他のシナリオで使用されています" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ scenario: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("scenarios").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
