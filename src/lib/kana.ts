/**
 * ふりがな入力補助(氏名のカナ自動採取)・半角カナ変換ユーティリティ。
 * 通販ゲート受注データ取込フォーマットの「ｶﾅ氏名」列(半角カナ)向け。
 */

const HIRAGANA_RANGE = /[ぁ-ゖ]/g;
const HIRAGANA_TO_KATAKANA_OFFSET = 0x60;

/** ひらがな→全角カタカナ(コードポイントを+0x60するだけの単純変換)。 */
export function hiraganaToKatakana(value: string): string {
  return value.replace(HIRAGANA_RANGE, (ch) => String.fromCharCode(ch.charCodeAt(0) + HIRAGANA_TO_KATAKANA_OFFSET));
}

/** 全角カタカナ1文字(濁点・半濁点付き含む)→半角カナ(結合済み)のマッピング。 */
const FULLWIDTH_KATAKANA_TO_HALFWIDTH: Record<string, string> = {
  ア: "ｱ", イ: "ｲ", ウ: "ｳ", エ: "ｴ", オ: "ｵ",
  カ: "ｶ", キ: "ｷ", ク: "ｸ", ケ: "ｹ", コ: "ｺ",
  ガ: "ｶﾞ", ギ: "ｷﾞ", グ: "ｸﾞ", ゲ: "ｹﾞ", ゴ: "ｺﾞ",
  サ: "ｻ", シ: "ｼ", ス: "ｽ", セ: "ｾ", ソ: "ｿ",
  ザ: "ｻﾞ", ジ: "ｼﾞ", ズ: "ｽﾞ", ゼ: "ｾﾞ", ゾ: "ｿﾞ",
  タ: "ﾀ", チ: "ﾁ", ツ: "ﾂ", テ: "ﾃ", ト: "ﾄ",
  ダ: "ﾀﾞ", ヂ: "ﾁﾞ", ヅ: "ﾂﾞ", デ: "ﾃﾞ", ド: "ﾄﾞ",
  ナ: "ﾅ", ニ: "ﾆ", ヌ: "ﾇ", ネ: "ﾈ", ノ: "ﾉ",
  ハ: "ﾊ", ヒ: "ﾋ", フ: "ﾌ", ヘ: "ﾍ", ホ: "ﾎ",
  バ: "ﾊﾞ", ビ: "ﾋﾞ", ブ: "ﾌﾞ", ベ: "ﾍﾞ", ボ: "ﾎﾞ",
  パ: "ﾊﾟ", ピ: "ﾋﾟ", プ: "ﾌﾟ", ペ: "ﾍﾟ", ポ: "ﾎﾟ",
  マ: "ﾏ", ミ: "ﾐ", ム: "ﾑ", メ: "ﾒ", モ: "ﾓ",
  ヤ: "ﾔ", ユ: "ﾕ", ヨ: "ﾖ",
  ャ: "ｬ", ュ: "ｭ", ョ: "ｮ",
  ラ: "ﾗ", リ: "ﾘ", ル: "ﾙ", レ: "ﾚ", ロ: "ﾛ",
  ワ: "ﾜ", ヲ: "ｦ", ン: "ﾝ",
  ァ: "ｧ", ィ: "ｨ", ゥ: "ｩ", ェ: "ｪ", ォ: "ｫ",
  ッ: "ｯ",
  ヴ: "ｳﾞ",
  ー: "ｰ",
  "　": " ",
};

/** 全角カタカナ→半角カナ。マッピングにない文字(記号・英数字等)はそのまま残す。 */
export function katakanaToHalfWidth(value: string): string {
  return [...value].map((ch) => FULLWIDTH_KATAKANA_TO_HALFWIDTH[ch] ?? ch).join("");
}

/** ひらがな・全角カタカナの読みを半角カナへ変換する(フリガナ自動採取用)。 */
export function toHalfWidthKatakana(value: string): string {
  return katakanaToHalfWidth(hiraganaToKatakana(value));
}

/** IME変換前の読み(ひらがな/カタカナのみ)かどうかの判定。数字・記号・英字はふりがなとして扱わない。 */
export function isReadingOnlyKana(value: string): boolean {
  return /^[぀-ゟ゠-ヿー]+$/.test(value);
}

/** フリガナ入力欄用の簡易バリデーション(半角カナ・スペースのみ許可)。 */
export function isHalfWidthKatakanaInput(value: string): boolean {
  return /^[ｦ-ﾝｰﾞﾟ\s]+$/.test(value);
}
