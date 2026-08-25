/**
 * 通販ゲート受注データ取込フォーマット(59項目)向けの固定値・変換ロジック。
 * この経路の対象はStripe決済の注文のみ(後払い・代引きはスマレジ側で完結するため対象外)。
 */

/** 決済方法(column 28)。Stripe以外はこの経路を通らないため、他の値は定義しない。 */
export const CORE_SYSTEM_PAYMENT_METHOD_LABEL = "77 ストライプ決済";

/** 媒体CD(column 55)。チャットボット(PDchatbot)用に発行された値。 */
export const CORE_SYSTEM_MEDIA_CODE = "5003";

/** 配送方法(column 35)、通常配送の固定値。 */
export const CORE_SYSTEM_SHIPPING_METHOD_LABEL = "宅急便";

/** 配送方法(column 35)、メール便(ポスト投函)の固定値。 */
export const CORE_SYSTEM_MAIL_SHIPPING_METHOD_LABEL = "郵メール";

/** 注文者顧客区分(column 17)は固定値。 */
export const CORE_SYSTEM_CUSTOMER_CATEGORY = "1";

/** 受付CD(column 54)は固定値。 */
export const CORE_SYSTEM_RECEPTION_CD = "4";

/** 性別(column 13)が未収集の場合のデフォルト値。 */
export const CORE_SYSTEM_GENDER_FALLBACK = "不明";

/**
 * 配送方法(column 35)を決める。決済フォームの「ポスト投函」制限
 * (単品1点のみ・アドオンなしの場合に限りメール便対象)と同じ条件を使う。
 */
export function resolveShippingMethodLabel(params: {
  isMailDeliverable: boolean;
  quantity: number;
  hasAddon: boolean;
}): string {
  const isMailEligible = params.isMailDeliverable && params.quantity === 1 && !params.hasAddon;
  return isMailEligible ? CORE_SYSTEM_MAIL_SHIPPING_METHOD_LABEL : CORE_SYSTEM_SHIPPING_METHOD_LABEL;
}

/** 配送時間(column 38)。チャットボットの選択肢文言を、通販ゲートの表記(半角ハイフン区切り)へ変換する。 */
const CORE_SYSTEM_DELIVERY_TIME_SLOT_MAP: Record<string, string> = {
  "午前中": "午前中",
  "12〜14時": "12:00-14:00",
  "14〜16時": "14:00-16:00",
  "16〜18時": "16:00-18:00",
  "18〜20時": "18:00-20:00",
  "19〜21時": "19:00-21:00",
};

export function toCoreSystemDeliveryTimeSlot(slot: string | null): string {
  if (!slot) return "";
  return CORE_SYSTEM_DELIVERY_TIME_SLOT_MAP[slot] ?? "";
}

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

/** 通販ゲート受注データ取込フォーマットの列見出し(59列)。この順序・表記のまま出力する(変更不可)。 */
export const CORE_SYSTEM_EXPORT_HEADER = [
  "web受注番号",
  "受付日",
  "注文者・氏名",
  "注文者・ｶﾅ氏名",
  "注文者・郵便番号",
  "注文者・都道府県",
  "注文者・市区郡",
  "注文者・町域",
  "注文者・番地",
  "注文者・方書1",
  "注文者・方書2",
  "注文者・電話番号",
  "注文者・性別",
  "注文者・誕生日",
  "注文者・会員番号",
  "注文者・メルアド",
  "注文者顧客区分",
  "届先・氏名",
  "届先・ｶﾅ氏名",
  "届先・郵便番号",
  "届先・都道府県",
  "届先・市区郡",
  "届先・町域",
  "届先・番地",
  "届先・方書1",
  "届先・方書2",
  "届先・電話番号",
  "決済方法",
  "与信管理番号",
  "クレジット会社",
  "カード番号",
  "カード名義人",
  "カード有効期限",
  "カード支払回数",
  "配送方法",
  "伝票記事",
  "配送希望日",
  "配送時間",
  "備考",
  "商品番号",
  "項目／選択肢",
  "単価",
  "個数",
  "商品合計",
  "税額",
  "手数料",
  "送料",
  "値引",
  "請求額",
  "商品名",
  "獲得ポイント",
  "使用ポイント",
  "DM発送区分",
  "受付CD",
  "媒体CD",
  "受電時間",
  "受電担当名",
  "FD",
  "番組CD",
] as const;
