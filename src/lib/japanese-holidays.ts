/**
 * 日本の祝日(振替休日・国民の休日を含む)を計算する。
 * 内閣府の祝日一覧に基づく近似実装(1980〜2099年の春分・秋分の日の計算式に依存)。
 * オリンピック特例年(2020, 2021)の祝日移動は考慮していない。
 */

function nthMonday(year: number, month: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const firstMonday = 1 + ((8 - first.getDay()) % 7);
  return new Date(year, month - 1, firstMonday + (n - 1) * 7);
}

function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}

function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getJapaneseHolidaysForYear(year: number): Set<string> {
  const holidays = new Map<string, Date>();
  const add = (date: Date) => holidays.set(dateKey(date), date);

  add(new Date(year, 0, 1)); // 元日
  add(nthMonday(year, 1, 2)); // 成人の日
  add(new Date(year, 1, 11)); // 建国記念の日
  if (year >= 2020) add(new Date(year, 1, 23)); // 天皇誕生日
  add(new Date(year, 2, vernalEquinoxDay(year))); // 春分の日
  add(new Date(year, 3, 29)); // 昭和の日
  add(new Date(year, 4, 3)); // 憲法記念日
  add(new Date(year, 4, 4)); // みどりの日
  add(new Date(year, 4, 5)); // こどもの日
  add(nthMonday(year, 7, 3)); // 海の日
  add(new Date(year, 7, 11)); // 山の日
  add(nthMonday(year, 9, 3)); // 敬老の日
  add(new Date(year, 8, autumnalEquinoxDay(year))); // 秋分の日
  add(nthMonday(year, 10, 2)); // スポーツの日
  add(new Date(year, 10, 3)); // 文化の日
  add(new Date(year, 10, 23)); // 勤労感謝の日

  // 振替休日: 日曜日の祝日の翌日(すでに祝日でない直近の平日)を休日にする
  const additions: Date[] = [];
  for (const d of holidays.values()) {
    if (d.getDay() === 0) {
      let next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      while (holidays.has(dateKey(next))) {
        next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
      }
      additions.push(next);
    }
  }
  for (const d of additions) add(d);

  // 国民の休日: 前後を祝日に挟まれた平日(日曜以外)を休日にする
  const sandwiched: Date[] = [];
  for (const d of holidays.values()) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const dayAfterNext = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2);
    if (!holidays.has(dateKey(next)) && holidays.has(dateKey(dayAfterNext)) && next.getDay() !== 0) {
      sandwiched.push(next);
    }
  }
  for (const d of sandwiched) add(d);

  return new Set(holidays.keys());
}

const holidayCache = new Map<number, Set<string>>();

export function isJapaneseHoliday(date: Date): boolean {
  const year = date.getFullYear();
  let cached = holidayCache.get(year);
  if (!cached) {
    cached = getJapaneseHolidaysForYear(year);
    holidayCache.set(year, cached);
  }
  return cached.has(dateKey(date));
}
