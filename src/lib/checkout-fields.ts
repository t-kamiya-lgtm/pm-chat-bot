export type CheckoutFieldKey =
  | "paymentMethod"
  | "name"
  | "email"
  | "phone"
  | "gender"
  | "birthday"
  | "postalCode"
  | "prefecture"
  | "city"
  | "line1"
  | "deliveryDate"
  | "deliveryTimeSlot";

export const CHECKOUT_FIELD_KEYS: CheckoutFieldKey[] = [
  "paymentMethod",
  "name",
  "email",
  "phone",
  "gender",
  "birthday",
  "postalCode",
  "prefecture",
  "city",
  "line1",
  "deliveryDate",
  "deliveryTimeSlot",
];

export const CHECKOUT_FIELD_LABELS: Record<CheckoutFieldKey, string> = {
  paymentMethod: "お支払い方法",
  name: "お名前",
  email: "メールアドレス",
  phone: "電話番号",
  gender: "性別",
  birthday: "生年月日",
  postalCode: "郵便番号",
  prefecture: "都道府県",
  city: "市区町村",
  line1: "番地・建物名",
  deliveryDate: "お届け希望日",
  deliveryTimeSlot: "お届け希望時間帯",
};

export const DEFAULT_CHECKOUT_FIELD_ORDER: CheckoutFieldKey[] = [...CHECKOUT_FIELD_KEYS];

/**
 * DBに保存済みの表示順に、まだ登録されていない(後から追加された)フィールドキーが
 * あれば、デフォルト順での相対位置を保ったまま挿入して補完する。
 */
export function mergeCheckoutFieldOrder(saved: CheckoutFieldKey[]): CheckoutFieldKey[] {
  const known = saved.filter((key) => CHECKOUT_FIELD_KEYS.includes(key));
  const missing = CHECKOUT_FIELD_KEYS.filter((key) => !known.includes(key));

  const merged = [...known];
  for (const key of missing) {
    const defaultIndex = DEFAULT_CHECKOUT_FIELD_ORDER.indexOf(key);
    const insertAt = merged.findIndex((k) => DEFAULT_CHECKOUT_FIELD_ORDER.indexOf(k) > defaultIndex);
    if (insertAt === -1) merged.push(key);
    else merged.splice(insertAt, 0, key);
  }
  return merged;
}

/** 郵便番号〜番地・建物名は常に1画面にまとめて表示するため、ひとつの塊として扱う。 */
export const ADDRESS_FIELD_KEYS: CheckoutFieldKey[] = ["postalCode", "prefecture", "city", "line1"];
export const ADDRESS_KEY_SET = new Set<CheckoutFieldKey>(ADDRESS_FIELD_KEYS);

/** お届け希望日・時間帯も常に1画面にまとめて表示する。 */
export const DELIVERY_FIELD_KEYS: CheckoutFieldKey[] = ["deliveryDate", "deliveryTimeSlot"];
export const DELIVERY_KEY_SET = new Set<CheckoutFieldKey>(DELIVERY_FIELD_KEYS);

/** 最短のお届け希望日: 本日から何営業日後(土日を除く)以降を指定可能にするか。 */
export const MIN_DELIVERY_LEAD_BUSINESS_DAYS = 5;

export const DELIVERY_TIME_SLOTS = [
  "指定なし",
  "午前中",
  "12〜14時",
  "14〜16時",
  "16〜18時",
  "18〜20時",
  "19〜21時",
] as const;
