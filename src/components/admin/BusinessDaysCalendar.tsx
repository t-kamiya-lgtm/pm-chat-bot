"use client";

import { useMemo, useState } from "react";
import { isJapaneseHoliday } from "@/lib/japanese-holidays";
import { Toast } from "@/components/admin/Toast";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function BusinessDaysCalendar({
  initialClosedDates,
}: {
  initialClosedDates: { date: string; reason: string | null }[];
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [closedDates, setClosedDates] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(initialClosedDates.map((d) => [d.date, d.reason])),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }

  const weeks = useMemo(() => {
    const { year, month } = cursor;
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: (number | null)[] = Array(firstDay.getDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  async function toggleClosed(dateKey: string) {
    setPending(dateKey);
    if (closedDates[dateKey] !== undefined) {
      const res = await fetch(`/api/business-closed-dates?date=${dateKey}`, { method: "DELETE" });
      if (res.ok) {
        setClosedDates((prev) => {
          const next = { ...prev };
          delete next[dateKey];
          return next;
        });
        showToast("自動保存しました");
      } else {
        showToast("保存に失敗しました", "error");
      }
    } else {
      const res = await fetch("/api/business-closed-dates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: dateKey }),
      });
      if (res.ok) {
        setClosedDates((prev) => ({ ...prev, [dateKey]: null }));
        showToast("自動保存しました");
      } else {
        showToast("保存に失敗しました", "error");
      }
    }
    setPending(null);
  }

  function changeMonth(delta: number) {
    setCursor((prev) => {
      const total = prev.year * 12 + (prev.month - 1) + delta;
      return { year: Math.floor(total / 12), month: (total % 12) + 1 };
    });
  }

  return (
    <div className="relative max-w-2xl">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          ← 前月
        </button>
        <span className="font-medium">
          {cursor.year}年{cursor.month}月
        </span>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
        >
          翌月 →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>

      {weeks.map((row, i) => (
        <div key={i} className="grid grid-cols-7 gap-1">
          {row.map((day, j) => {
            if (day === null) return <div key={j} className="aspect-square" />;
            const dateKey = toDateKey(cursor.year, cursor.month, day);
            const date = new Date(cursor.year, cursor.month - 1, day);
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = isJapaneseHoliday(date);
            const isClosed = closedDates[dateKey] !== undefined;
            const isNonBusiness = isWeekend || isHoliday || isClosed;
            return (
              <label
                key={j}
                className={`flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border p-1 text-xs ${
                  isNonBusiness ? "border-red-200 bg-red-50 text-red-700" : "border-neutral-200 bg-white"
                }`}
              >
                <span className="font-medium">{day}</span>
                {isHoliday && <span className="text-[10px]">祝日</span>}
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={isClosed}
                  disabled={pending === dateKey || isWeekend || isHoliday}
                  onChange={() => toggleClosed(dateKey)}
                />
              </label>
            );
          })}
        </div>
      ))}

      <p className="mt-4 text-xs text-neutral-500">
        赤色のマスは非営業日(お届け日の指定対象外)です。土日・祝日は自動判定のためチェックできません。
        それ以外を臨時休業日にする場合はチェックを入れてください。
      </p>
    </div>
  );
}
