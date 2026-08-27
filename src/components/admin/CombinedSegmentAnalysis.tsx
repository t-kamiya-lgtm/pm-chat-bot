import { SEGMENT_AXES, type SegmentAxis, type LtvSegmentRow, type ConversionSegmentRow } from "@/lib/subscription-ltv";
import {
  LtvSegmentTable,
  ConversionSegmentTable,
  LTV_SEGMENT_CSV_HEADERS,
  ltvSegmentCsvRow,
  CONVERSION_SEGMENT_CSV_HEADERS,
  conversionSegmentCsvRow,
} from "@/components/admin/LtvSegmentTable";
import { CsvExportButton } from "@/components/admin/CsvExportButton";

/**
 * 複数のセグメント軸(シナリオ×LP×オファーなど)を組み合わせた集計。
 * 軸の選択自体はGETフォームでページ全体を再読み込みして反映する
 * (他の絞り込みフォームと同じ方式)。
 */
export function CombinedSegmentAnalysis({
  selectedAxes,
  ltvRows,
  conversionRows,
  dateFrom,
  dateTo,
  brandId,
}: {
  selectedAxes: SegmentAxis[];
  ltvRows: LtvSegmentRow[];
  conversionRows: ConversionSegmentRow[];
  dateFrom: string;
  dateTo: string;
  brandId: string;
}) {
  const segmentHeader = selectedAxes.length > 0 ? SEGMENT_AXES.filter((a) => selectedAxes.includes(a.key)).map((a) => a.label).join(" × ") : "セグメント";

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-neutral-700">複数セグメント組み合わせ集計</h3>
        <p className="mb-2 text-xs text-neutral-500">
          2つ以上の軸を選んで「集計する」を押すと、その組み合わせ(例:シナリオ×LP×オファー)ごとにLTV・引き上げ率を集計します。
        </p>
        <form method="get" className="print:hidden flex flex-wrap items-end gap-3 text-sm">
          {dateFrom && <input type="hidden" name="dateFrom" value={dateFrom} />}
          {dateTo && <input type="hidden" name="dateTo" value={dateTo} />}
          {brandId && <input type="hidden" name="brandId" value={brandId} />}
          <div className="flex flex-wrap gap-2">
            {SEGMENT_AXES.map((a) => (
              <label
                key={a.key}
                className="flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
              >
                <input type="checkbox" name="combine" value={a.key} defaultChecked={selectedAxes.includes(a.key)} />
                {a.label}
              </label>
            ))}
          </div>
          <button type="submit" className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">
            集計する
          </button>
        </form>
      </div>

      {selectedAxes.length < 2 ? (
        <p className="text-sm text-neutral-400">軸を2つ以上選んで集計してください。</p>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-neutral-700">定期LTVランキング({segmentHeader})</h4>
              <CsvExportButton
                filename={`定期LTVランキング_組み合わせ.csv`}
                headers={LTV_SEGMENT_CSV_HEADERS}
                rows={ltvRows.map(ltvSegmentCsvRow)}
              />
            </div>
            <LtvSegmentTable rows={ltvRows} segmentHeader={segmentHeader} />
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-neutral-700">単品→定期引き上げ率({segmentHeader})</h4>
              <CsvExportButton
                filename={`単品→定期引き上げ率_組み合わせ.csv`}
                headers={CONVERSION_SEGMENT_CSV_HEADERS}
                rows={conversionRows.map(conversionSegmentCsvRow)}
              />
            </div>
            <ConversionSegmentTable rows={conversionRows} segmentHeader={segmentHeader} />
          </div>
        </div>
      )}
    </div>
  );
}
