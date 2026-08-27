/** CSV1セル分の値をエスケープする(カンマ・改行・ダブルクォートを含む場合は"..."で囲む)。 */
function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** ヘッダー行+データ行からCSV文字列を組み立てる(Excelでの文字化けを防ぐBOM付き)。 */
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  return "﻿" + lines.join("\r\n");
}
