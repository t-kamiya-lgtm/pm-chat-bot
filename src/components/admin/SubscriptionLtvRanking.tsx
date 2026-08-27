"use client";

import { useState } from "react";
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

type ViewMode = "ltv" | "conversion";

export function SubscriptionLtvRanking({
  ltvRankingsByAxis,
  conversionRankingsByAxis,
}: {
  ltvRankingsByAxis: Record<SegmentAxis, LtvSegmentRow[]>;
  conversionRankingsByAxis: Record<SegmentAxis, ConversionSegmentRow[]>;
}) {
  const [axis, setAxis] = useState<SegmentAxis>("scenario");
  const [view, setView] = useState<ViewMode>("ltv");

  const ltvRows = ltvRankingsByAxis[axis] ?? [];
  const conversionRows = conversionRankingsByAxis[axis] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-neutral-200 pb-3">
        <button
          type="button"
          onClick={() => setView("ltv")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            view === "ltv" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          定期LTVランキング
        </button>
        <button
          type="button"
          onClick={() => setView("conversion")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            view === "conversion"
              ? "bg-neutral-900 text-white"
              : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          単品→定期引き上げ率
        </button>
      </div>

      <div>
        <span className="mb-1 block text-xs text-neutral-500">セグメント軸</span>
        <div className="flex flex-wrap gap-1">
          {SEGMENT_AXES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAxis(a.key)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                axis === a.key
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-neutral-300 text-neutral-500 hover:bg-neutral-50"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {view === "ltv" ? (
        <div className="space-y-2">
          <div className="flex justify-end">
            <CsvExportButton
              filename={`定期LTVランキング_${axis}.csv`}
              headers={LTV_SEGMENT_CSV_HEADERS}
              rows={ltvRows.map(ltvSegmentCsvRow)}
            />
          </div>
          <LtvSegmentTable rows={ltvRows} />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <CsvExportButton
              filename={`単品→定期引き上げ率_${axis}.csv`}
              headers={CONVERSION_SEGMENT_CSV_HEADERS}
              rows={conversionRows.map(conversionSegmentCsvRow)}
            />
          </div>
          <ConversionSegmentTable rows={conversionRows} />
        </div>
      )}
    </div>
  );
}
