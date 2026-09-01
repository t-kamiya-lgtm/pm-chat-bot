import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { customerRetentionActions } from "@/db/schema";
import { requireAdminRole } from "@/lib/require-role";

const createSchema = z.object({
  campaignTypeId: z.string().uuid(),
  performedMonth: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM形式で指定してください"),
  subscriptionId: z.string().uuid().nullable().optional(),
  detail: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/** 顧客の継続施策ログを記録する(顧客管理画面⑥)。 */
export async function POST(request: Request, { params }: RouteParams) {
  const roleCheck = await requireAdminRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id: customerId } = await params;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = await getDb();
  let data;
  try {
    [data] = await db
      .insert(customerRetentionActions)
      .values({
        customerId,
        campaignTypeId: parsed.data.campaignTypeId,
        performedMonth: `${parsed.data.performedMonth}-01`,
        subscriptionId: parsed.data.subscriptionId ?? null,
        detail: parsed.data.detail || null,
        createdBy: roleCheck.user.id,
      })
      .returning();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ retentionAction: data }, { status: 201 });
}
