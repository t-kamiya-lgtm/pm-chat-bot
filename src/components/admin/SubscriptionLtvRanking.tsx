"use client";

import { useState } from "react";
import { SEGMENT_AXES, type SegmentAxis, type LtvSegmentRow, type ConversionSegmentRow } from "@/lib/subscription-ltv";

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
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-sky-100 text-xs text-neutral-600">
                <tr>
                  <th className="px-4 py-2">順位</th>
                  <th className="px-4 py-2">セグメント</th>
                  <th className="px-4 py-2">契約者数</th>
                  <th className="px-4 py-2">定期LTV</th>
                  <th className="px-4 py-2">売上LTV</th>
                  <th className="px-4 py-2">平均継続回数</th>
                  <th className="px-4 py-2">平均単価</th>
                  <th className="px-4 py-2">平均購入点数</th>
                  <th className="px-4 py-2">増分利益</th>
                  <th className="px-4 py-2">増分利益LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {ltvRows.map((row, i) => (
                  <tr key={row.segment} className="hover:bg-neutral-50">
                    <td className="px-4 py-2 text-neutral-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{row.segment}</td>
                    <td className="px-4 py-2">{row.customerCount.toLocaleString()}人</td>
                    <td className="px-4 py-2 font-semibold">{Math.round(row.subscriptionLtv).toLocaleString()}円</td>
                    <td className="px-4 py-2">{Math.round(row.revenueLtv).toLocaleString()}円</td>
                    <td className="px-4 py-2">{row.avgCycleCount.toFixed(1)}回</td>
                    <td className="px-4 py-2">{Math.round(row.avgOrderRevenue).toLocaleString()}円</td>
                    <td className="px-4 py-2">{row.avgQuantityPerOrder.toFixed(1)}点</td>
                    <td className="px-4 py-2">{Math.round(row.totalIncrementalProfit).toLocaleString()}円</td>
                    <td className="px-4 py-2">{Math.round(row.incrementalProfitLtv).toLocaleString()}円</td>
                  </tr>
                ))}
                {ltvRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-6 text-center text-neutral-400">
                      対象の定期契約者がいません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ul className="space-y-0.5 text-xs text-neutral-400">
            <li>契約者数: 対象期間内に存在した定期契約者の人数(全件表示、上位N件への絞り込みは行っていません)</li>
            <li>定期LTV: 定期契約者の定期関連売上(税込)合計 ÷ 契約者数</li>
            <li>売上LTV: 単品購入分も含む、期間内の全売上(税込)合計 ÷ 契約者数</li>
            <li>平均継続回数: 1人あたりの定期の請求回数(周期数)の平均</li>
            <li>平均単価: 定期注文1回あたりの平均売上(税込)</li>
            <li>平均購入点数: 定期注文1回あたりの平均数量</li>
            <li>増分利益: 広告費を除く増分利益(売上-原価-同梱物費用-送料原価-販売手数料-支払手数料、原価等は税別)の期間合計。コスト設定導入前の注文は0円として合算</li>
            <li>増分利益LTV: 期間合計増分利益 ÷ 契約者数</li>
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-sky-100 text-xs text-neutral-600">
                <tr>
                  <th className="px-4 py-2">順位</th>
                  <th className="px-4 py-2">セグメント</th>
                  <th className="px-4 py-2">単品購入者数</th>
                  <th className="px-4 py-2">定期移行者数</th>
                  <th className="px-4 py-2">引き上げ率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {conversionRows.map((row, i) => (
                  <tr key={row.segment} className="hover:bg-neutral-50">
                    <td className="px-4 py-2 text-neutral-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{row.segment}</td>
                    <td className="px-4 py-2">{row.oneTimeBuyerCount.toLocaleString()}人</td>
                    <td className="px-4 py-2">{row.convertedCount.toLocaleString()}人</td>
                    <td className="px-4 py-2 font-semibold">
                      {row.conversionRate === null ? "-" : `${(row.conversionRate * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
                {conversionRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                      対象の単品購入者がいません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ul className="space-y-0.5 text-xs text-neutral-400">
            <li>単品購入者数: セグメントの条件に該当する初回注文が単品だった顧客の人数(全件表示)</li>
            <li>定期移行者数: そのうち後から定期契約に至った人数</li>
            <li>引き上げ率: 定期移行者数 ÷ 単品購入者数</li>
          </ul>
        </div>
      )}
    </div>
  );
}
