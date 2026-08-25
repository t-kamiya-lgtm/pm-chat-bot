import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCatalogRole } from "@/lib/require-role";
import { sendShipmentCompleteEmail } from "@/lib/order-status-emails";

interface ParsedRow {
  line: number;
  orderNumber: string;
  shipDate: string;
  carrierName: string;
  trackingNumber: string;
}

/**
 * 出荷報告データ(基幹システム「通販ゲート」からの送り状データ)のExcel(.xlsx)を解析する。
 * 列構成: 送信/顧客番号/名前/メールアドレス/受注番号/支払方法/受注日/出荷日/配完日/
 * システム保留/ユーザー保留/問合せ番号/送信日/件名/媒体名/WEB用受注番号/配送方法。
 * このうち当システムの注文番号(order_number)と対応するのは「WEB用受注番号」列。
 * 「媒体名」が"WEB"以外の行(他媒体経由の注文)は対象外として無視する。
 */
function parseShipmentWorkbook(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const rows: ParsedRow[] = [];
  records.forEach((record, index) => {
    const media = String(record["媒体名"] ?? "").trim();
    if (media !== "WEB") return; // 他媒体経由の注文は対象外

    const orderNumber = String(record["WEB用受注番号"] ?? "").trim();
    if (!orderNumber) return; // 当システムの注文と対応しない行は無視

    rows.push({
      line: index + 2, // 1行目はヘッダーのため+2
      orderNumber,
      shipDate: String(record["出荷日"] ?? "").trim(),
      carrierName: String(record["配送方法"] ?? "").trim(),
      trackingNumber: String(record["問合せ番号"] ?? "").trim(),
    });
  });
  return rows;
}

/** "26/08/20"(YY/MM/DD、西暦下2桁)形式の日付文字列をDateに変換する。 */
function parseShipDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yy, mm, dd] = match;
  const date = new Date(2000 + Number(yy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 出荷報告データ(.xlsx)を取り込み、対応するStripe注文の受注ステータスを「出荷済」に進めて
 * 出荷完了メールを送信する。代引き・後払いの注文は対象外(スマレジ側で完結するため)。
 */
export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ファイルが指定されていません" }, { status: 400 });
  }

  let rows: ParsedRow[];
  try {
    rows = parseShipmentWorkbook(await file.arrayBuffer());
  } catch (err) {
    return NextResponse.json(
      { error: `ファイルの読み込みに失敗しました: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "取り込み可能な行がありません(媒体名がWEBかつWEB用受注番号が設定された行が必要です)" },
      { status: 400 },
    );
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

    const shippedAt = parseShipDate(row.shipDate) ?? new Date();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        import_status: "shipped",
        import_status_updated_at: new Date().toISOString(),
        shipped_at: shippedAt.toISOString(),
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
