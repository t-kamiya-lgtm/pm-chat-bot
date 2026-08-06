import { isJapaneseHoliday } from "@/lib/japanese-holidays";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function MonthGrid({ year, month, closedDates }: { year: number; month: number; closedDates: Set<string> }) {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = Array(firstDay.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <div>
      <p className="mb-1 text-center text-sm font-medium">
        {year}年{month}月
      </p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-neutral-400">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-0.5">
            {label}
          </div>
        ))}
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-7 gap-0.5">
          {row.map((day, j) => {
            if (day === null) return <div key={j} className="aspect-square" />;
            const dateKey = toDateKey(year, month, day);
            const dayOfWeek = new Date(year, month - 1, day).getDay();
            const isNonBusiness =
              dayOfWeek === 0 || dayOfWeek === 6 || isJapaneseHoliday(new Date(year, month - 1, day)) || closedDates.has(dateKey);
            return (
              <div
                key={j}
                className={`flex aspect-square items-center justify-center rounded text-xs ${
                  isNonBusiness ? "bg-red-50 text-red-600" : "text-neutral-700"
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function BusinessCalendarView({ closedDates }: { closedDates: Set<string> }) {
  const today = new Date();
  const months = [0, 1].map((offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  return (
    <div className="max-w-[90%] space-y-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        {months.map(({ year, month }) => (
          <MonthGrid key={`${year}-${month}`} year={year} month={month} closedDates={closedDates} />
        ))}
      </div>
      <p className="text-center text-[11px] text-neutral-400">赤色は休業日(土日・祝日・臨時休業日)です</p>
    </div>
  );
}
