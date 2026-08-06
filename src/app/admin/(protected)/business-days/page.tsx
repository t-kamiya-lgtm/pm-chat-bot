import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BusinessDaysCalendar } from "@/components/admin/BusinessDaysCalendar";

export const dynamic = "force-dynamic";

export default async function AdminBusinessDaysPage() {
  const supabase = createSupabaseAdminClient();
  const { data: closedDates } = await supabase
    .from("business_closed_dates")
    .select("date, reason")
    .order("date", { ascending: true });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">営業日設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        お届け希望日の入力可能範囲(最短営業日)の計算に使う休業日を管理します。土日・祝日は自動で
        非営業日として扱われます。年末年始休業など、それ以外の休業日はここでチェックを入れて追加してください。
      </p>
      <BusinessDaysCalendar initialClosedDates={closedDates ?? []} />
    </div>
  );
}
