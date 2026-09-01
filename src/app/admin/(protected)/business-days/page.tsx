import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessClosedDates } from "@/db/schema";
import { BusinessDaysCalendar } from "@/components/admin/BusinessDaysCalendar";

export const dynamic = "force-dynamic";

export default async function AdminBusinessDaysPage() {
  let closedDates: { date: string; reason: string | null }[] = [];
  let loadError: string | null = null;
  try {
    const db = await getDb();
    closedDates = await db
      .select({ date: businessClosedDates.date, reason: businessClosedDates.reason })
      .from(businessClosedDates)
      .orderBy(asc(businessClosedDates.date));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error("[admin/business-days] failed to load closed dates", err);
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">営業日設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        お届け希望日の入力可能範囲(最短営業日)の計算に使う休業日を管理します。土日・祝日は自動で
        非営業日として扱われます。年末年始休業など、それ以外の休業日はここでチェックを入れて追加してください。
      </p>
      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          休業日一覧の取得に失敗しました({loadError})
        </p>
      )}
      <BusinessDaysCalendar initialClosedDates={closedDates} />
    </div>
  );
}
