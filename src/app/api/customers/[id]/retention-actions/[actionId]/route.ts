import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { customerRetentionActions } from "@/db/schema";
import { requireAdminRole } from "@/lib/require-role";

type RouteParams = { params: Promise<{ id: string; actionId: string }> };

/** 誤って記録した継続施策ログを削除する。 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id, actionId } = await params;

  const db = await getDb();
  try {
    await db
      .delete(customerRetentionActions)
      .where(and(eq(customerRetentionActions.id, actionId), eq(customerRetentionActions.customerId, id)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
