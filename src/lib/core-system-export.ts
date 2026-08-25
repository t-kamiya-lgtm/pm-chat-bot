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
