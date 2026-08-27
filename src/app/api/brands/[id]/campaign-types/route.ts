import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** ブランドに登録された継続施策タイトルの一覧・登録。顧客管理画面ではここから選択する。 */
export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("retention_campaign_types")
    .select("*")
    .eq("brand_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaignTypes: data });
}

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("retention_campaign_types")
    .insert({ brand_id: id, title: parsed.data.title, description: parsed.data.description ?? null })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaignType: data }, { status: 201 });
}
