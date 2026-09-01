import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { retentionCampaignTypes } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string; typeId: string }> };

/**
 * 継続施策タイトルを削除する。既にログで使われているタイトルを消すと過去ログの表示に
 * 影響するため、削除前に使用有無を確認しユーザーに委ねる(呼び出し元でconfirmする想定)。
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, typeId } = await params;

  try {
    const db = await getDb();
    await db
      .delete(retentionCampaignTypes)
      .where(and(eq(retentionCampaignTypes.id, typeId), eq(retentionCampaignTypes.brandId, id)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
