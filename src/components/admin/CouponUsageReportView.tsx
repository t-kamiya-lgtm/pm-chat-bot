import Link from "next/link";
import { CsvExportButton } from "@/components/admin/CsvExportButton";
import type { CouponUsageReport } from "@/lib/coupon-usage-report";

function formatYen(amount: number): string {
  return `${amount.toLocaleString()}円`;
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}年${Number(m)}月`;
}

function shiftMonth(month: string, diff: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDayLabel(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * クーポン実績タブの中身。指定月の日別×クーポン種別(自動適用/手入力コード)の
 * 利用額(値引き額)・利用件数と、月合計をまとめて表示する。
 */
export function CouponUsageReportView({ month, report }: { month: string; report: CouponUsageReport }) {
  const csvHeaders = ["日付", "自動適用(円)", "自動適用(件)", "手入力コード(円)", "手入力コード(件)", "合計(円)", "合計(件)"];
  const csvRows = report.days.map((d) => [
    d.day,
    d.scenarioAutoAmount,
    d.scenarioAutoCount,
    d.manualCodeAmount,
    d.manualCodeCount,
    d.totalAmount,
    d.totalCount,
  ]);

  return (
    <div>
      <div className="print:hidden mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`?tab=usage&month=${shiftMonth(month, -1)}`}
          className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-50"
        >
          ← 前月
        </Link>
        <span className="font-semibold">{formatMonthLabel(month)}</span>
        <Link
          href={`?tab=usage&month=${shiftMonth(month, 1)}`}
          className="rounded-md border border-neutral-300 px-2.5 py-1 hover:bg-neutral-50"
        >
          翌月 →
        </Link>
        <form method="get" className="ml-2 flex items-center gap-2">
          <input type="hidden" name="tab" value="usage" />
          <input type="month" name="month" defaultValue={month} className="input" />
          <button type="submit" className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">
            表示
          </button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="クーポン合計額(値引き額)" value={formatYen(report.totalAmount)} sub={`${report.totalCount.toLocaleString()}件`} />
        <SummaryCard
          label="自動適用"
          value={formatYen(report.scenarioAutoTotalAmount)}
          sub={`${report.scenarioAutoTotalCount.toLocaleString()}件`}
        />
        <SummaryCard
          label="手入力コード"
          value={formatYen(report.manualCodeTotalAmount)}
          sub={`${report.manualCodeTotalCount.toLocaleString()}件`}
        />
      </div>

      <div className="mb-2 flex items-center justify-end">
        <CsvExportButton filename={`クーポン実績_${month}.csv`} headers={csvHeaders} rows={csvRows} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-sky-100 text-xs text-neutral-600">
            <tr>
              <th className="px-4 py-2">日付</th>
              <th className="px-4 py-2 text-right">自動適用</th>
              <th className="px-4 py-2 text-right">手入力コード</th>
              <th className="px-4 py-2 text-right">合計</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {report.days.map((d) => (
              <tr key={d.day} className={d.totalAmount === 0 ? "text-neutral-400" : undefined}>
                <td className="px-4 py-2">{formatDayLabel(d.day)}</td>
                <td className="px-4 py-2 text-right">
                  {formatYen(d.scenarioAutoAmount)}
                  {d.scenarioAutoCount > 0 && <span className="ml-1 text-xs text-neutral-400">({d.scenarioAutoCount}件)</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatYen(d.manualCodeAmount)}
                  {d.manualCodeCount > 0 && <span className="ml-1 text-xs text-neutral-400">({d.manualCodeCount}件)</span>}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-neutral-900">
                  {formatYen(d.totalAmount)}
                  {d.totalCount > 0 && <span className="ml-1 text-xs text-neutral-400">({d.totalCount}件)</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-300 bg-neutral-50 font-semibold">
              <td className="px-4 py-2">合計</td>
              <td className="px-4 py-2 text-right">{formatYen(report.scenarioAutoTotalAmount)}</td>
              <td className="px-4 py-2 text-right">{formatYen(report.manualCodeTotalAmount)}</td>
              <td className="px-4 py-2 text-right">{formatYen(report.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        入金/受注が確定した注文(与信待ち・失敗・キャンセルを除く)のうち、クーポンが適用されたものを集計しています。金額はクーポンによる値引き額の合計です(注文金額そのものではありません)。
      </p>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}
