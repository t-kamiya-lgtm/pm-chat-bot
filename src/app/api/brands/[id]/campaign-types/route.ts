import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { retentionCampaignTypes } from "@/db/schema";
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

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(retentionCampaignTypes)
      .where(eq(retentionCampaignTypes.brandId, id))
      .orderBy(asc(retentionCampaignTypes.createdAt));
    return NextResponse.json({ campaignTypes: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const db = await getDb();
    const [row] = await db
      .insert(retentionCampaignTypes)
      .values({ brandId: id, title: parsed.data.title, description: parsed.data.description ?? null })
      .returning();
    return NextResponse.json({ campaignType: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
