import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_ORDER_CODE = "XX";

/**
 * 注文番号(シナリオの注文番号コード + 日付8桁 + 時間2桁 + その時間内の連番3桁)を生成する。
 * シナリオに注文番号コードが未設定の場合はデフォルトコードを使う。
 * 連番は同一シナリオ・同一時間帯の既存注文数から算出する簡易採番のため、
 * 極めて稀な同時アクセスでは重複しうる(注文番号はDB上の一意キーではない)。
 */
export async function generateOrderNumber(
  supabase: SupabaseClient,
  scenarioId: string | null | undefined,
): Promise<string> {
  let orderCode = DEFAULT_ORDER_CODE;
  if (scenarioId) {
    const { data: scenario } = await supabase
      .from("scenarios")
      .select("order_code")
      .eq("id", scenarioId)
      .maybeSingle();
    if (scenario?.order_code) orderCode = scenario.order_code;
  }

  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const hourPart = String(now.getHours()).padStart(2, "0");

  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

  let countQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("created_at", hourStart.toISOString())
    .lt("created_at", hourEnd.toISOString());
  countQuery = scenarioId ? countQuery.eq("scenario_id", scenarioId) : countQuery.is("scenario_id", null);

  const { count } = await countQuery;
  const seq = String((count ?? 0) + 1).padStart(3, "0");

  return `${orderCode}${datePart}${hourPart}${seq}`;
}
