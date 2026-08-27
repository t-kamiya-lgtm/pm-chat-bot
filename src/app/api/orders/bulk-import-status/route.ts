import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { sendCancellationEmail } from "@/lib/order-status-emails";
import { applyImportStatusChange } from "@/lib/order-import-status";

const bulkUpdateSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1),
  importStatus: z.enum([
    "imported",
    "on_hold",
    "not_imported",
    "import_error",
    "excluded",
    "shipped",
    "canceled",
  ]),
});

/** 選択した複数注文の取り込みステータスを一括で変更する。遷移が許可されない注文はスキップしエラーとして報告する。 */
export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const results = await Promise.all(
    parsed.data.orderIds.map(async (orderId) => ({
      orderId,
      result: await applyImportStatusChange(supabase, orderId, parsed.data.importStatus),
    })),
  );

  const succeeded = results.filter((r) => r.result.ok).map((r) => r.orderId);
  const failed = results
    .filter((r): r is { orderId: string; result: { ok: false; error: string } } => !r.result.ok)
    .map((r) => ({ orderId: r.orderId, error: r.result.error }));

  if (parsed.data.importStatus === "canceled" && succeeded.length > 0) {
    await Promise.all(succeeded.map((orderId) => sendCancellationEmail(orderId)));
  }

  return NextResponse.json({ ok: failed.length === 0, updated: succeeded.length, failed });
}
