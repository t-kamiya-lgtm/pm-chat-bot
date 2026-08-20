import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { sendShipmentCompleteEmail } from "@/lib/order-status-emails";

const requestSchema = z.object({
  csv: z.string().min(1),
});

interface ParsedRow {
  line: number;
  orderNumber: string;
  shipDate: string;
  carrierName: string;
  trackingNumber: string;
}

const HEADER_ALIASES = new Set(["注文番号", "order_number", "orderNumber"]);

function parseCsv(csv: string): ParsedRow[] {
  const lines = csv
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows: ParsedRow[] = [];
  lines.forEach((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (index === 0 && HEADER_ALIASES.has(cells[0])) return; // ヘッダー行はスキップ
    const [orderNumber, shipDate, carrierName, trackingNumber] = cells;
    if (!orderNumber) return;
    rows.push({
      line: index + 1,
      orderNumber,
      shipDate: shipDate ?? "",
      carrierName: carrierName ?? "",
      trackingNumber: trackingNumber ?? "",
    });
  });
  return rows;
}

/**
 * 送り状データCSV(注文番号・出荷日・運送会社名・送り状番号)を取り込み、
 * Stripe注文の受注ステータスを「出荷済」に進めて出荷完了メールを送信する。
 * 代引き・後払いの注文は対象外(スマレジ側で完結するため)。
 */
export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: "取り込み可能な行がありません" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const errors: { line: number; orderNumber: string; reason: string }[] = [];
  let success = 0;

  for (const row of rows) {
    const { data: matches, error: findError } = await supabase
      .from("orders")
      .select("id, payment_method, import_status")
      .eq("order_number", row.orderNumber);

    if (findError) {
      errors.push({ line: row.line, orderNumber: row.orderNumber, reason: findError.message });
      continue;
    }
    if (!matches || matches.length === 0) {
      errors.push({ line: row.line, orderNumber: row.orderNumber, reason: "該当する注文が見つかりません" });
      continue;
    }
    if (matches.length > 1) {
      errors.push({
        line: row.line,
        orderNumber: row.orderNumber,
        reason: "同じ注文番号が複数件あり、対象を特定できません",
      });
      continue;
    }

    const order = matches[0];
    if (order.payment_method !== "stripe") {
      errors.push({
        line: row.line,
        orderNumber: row.orderNumber,
        reason: "Stripe決済以外の注文は出荷済に設定できません(代引き・後払いは対象外)",
      });
      continue;
    }

    const shippedAt = row.shipDate ? new Date(row.shipDate) : new Date();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        import_status: "shipped",
        import_status_updated_at: new Date().toISOString(),
        shipped_at: Number.isNaN(shippedAt.getTime()) ? new Date().toISOString() : shippedAt.toISOString(),
        carrier_name: row.carrierName || null,
        tracking_number: row.trackingNumber || null,
      })
      .eq("id", order.id);

    if (updateError) {
      errors.push({ line: row.line, orderNumber: row.orderNumber, reason: updateError.message });
      continue;
    }

    await sendShipmentCompleteEmail(order.id);
    success += 1;
  }

  return NextResponse.json({ success, total: rows.length, errors });
}
