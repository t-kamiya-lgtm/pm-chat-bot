import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SurveyQuestion } from "@/lib/types";

/**
 * 通販ゲート受注データ取込フォーマット(59項目)向けの固定値・変換ロジック。
 * この経路の対象はStripe決済の注文のみ(後払い・代引きはスマレジ側で完結するため対象外)。
 */

/** 決済方法(column 28)。Stripe以外はこの経路を通らないため、他の値は定義しない。 */
export const CORE_SYSTEM_PAYMENT_METHOD_LABEL = "77 ストライプ決済";

/** 媒体CD(column 55)。チャットボット(PDchatbot)用に発行された値。 */
export const CORE_SYSTEM_MEDIA_CODE = "5003";

/** 配送方法(column 35)は固定値。 */
export const CORE_SYSTEM_SHIPPING_METHOD_LABEL = "宅急便";

const FULLWIDTH_DIGITS = "０-９";
const DIGIT_CLASS = `0-9${FULLWIDTH_DIGITS}`;
const LEADING_NON_DIGIT_PATTERN = new RegExp(`^([^${DIGIT_CLASS}]*)([${DIGIT_CLASS}].*)$`);

/**
 * 「番地・建物名」欄(line1、町域+番地をまとめて自由入力してもらっている)を、
 * 通販ゲートの「町域」「番地」の2項目に分割する簡易処理。
 * 日本語住所は(町域などの地名)の後に(番地の数字)が続くのが一般的なため、
 * 最初に現れる数字の位置で前後に分割する。数字が全く含まれない場合は
 * 全体を町域として扱い、番地は空欄にする(完全に正確な分割を保証するものではない)。
 */
export function splitAddressLine1(line1: string): { chiiki: string; banchi: string } {
  const trimmed = line1.trim();
  const match = LEADING_NON_DIGIT_PATTERN.exec(trimmed);
  if (!match) return { chiiki: trimmed, banchi: "" };
  return { chiiki: match[1].trim(), banchi: match[2].trim() };
}

/** "YYYY-MM-DD"(HTML date input形式)を通販ゲートの"YY/MM/DD"(西暦下2桁)へ変換する。 */
export function toCoreSystemDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return "";
  const [, yyyy, mm, dd] = match;
  return `${yyyy.slice(2)}/${mm}/${dd}`;
}

/** 性別の表記ゆれ(女性/男性 等)を、通販ゲートの許容値(女/男/法人/不明)へ正規化する。 */
function normalizeGenderAnswer(answer: string): string {
  if (answer.includes("法人")) return "法人";
  if (answer.includes("女")) return "女";
  if (answer.includes("男")) return "男";
  return "";
}

/**
 * 注文に紐づくシナリオのアンケートノードから、性別・生年月日を収集できないか試みる。
 * ・生年月日: type="date"の設問(既存の管理画面上の表記でも「生年月日」用として案内している)
 * ・性別: type="radio"かつ設問文に「性別」を含むもの(見つからなければ収集しない)
 * アンケート回答は設問の label をキーに保存されているため、それをそのまま突き合わせる。
 * 該当する設問が無い/回答が無い/取得に失敗した場合は、いずれも空文字を返す(仕様上の必須項目
 * ではあるが、エラー時は空欄のままにする方針のため例外は投げない)。
 */
export async function extractGenderAndBirthdayFromSurvey(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  scenarioId: string | null,
  surveyResponses: Record<string, string> | null,
): Promise<{ gender: string; birthday: string }> {
  const empty = { gender: "", birthday: "" };
  if (!scenarioId || !surveyResponses) return empty;

  try {
    const { data: nodes, error } = await supabase
      .from("scenario_nodes")
      .select("content")
      .eq("scenario_id", scenarioId)
      .eq("type", "survey");
    if (error || !nodes) return empty;

    let gender = "";
    let birthday = "";
    for (const node of nodes) {
      const questions = (node.content as { questions?: SurveyQuestion[] } | null)?.questions ?? [];
      for (const question of questions) {
        const answer = surveyResponses[question.label];
        if (!answer) continue;
        if (!birthday && question.type === "date") {
          birthday = toCoreSystemDate(answer);
        }
        if (!gender && question.type === "radio" && question.label.includes("性別")) {
          gender = normalizeGenderAnswer(answer);
        }
      }
    }
    return { gender, birthday };
  } catch {
    return empty;
  }
}
