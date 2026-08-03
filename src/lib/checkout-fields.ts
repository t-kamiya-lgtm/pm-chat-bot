export type CheckoutFieldKey =
  | "name"
  | "email"
  | "phone"
  | "postalCode"
  | "prefecture"
  | "city"
  | "line1";

export const CHECKOUT_FIELD_KEYS: CheckoutFieldKey[] = [
  "name",
  "email",
  "phone",
  "postalCode",
  "prefecture",
  "city",
  "line1",
];

export const CHECKOUT_FIELD_LABELS: Record<CheckoutFieldKey, string> = {
  name: "お名前",
  email: "メールアドレス",
  phone: "電話番号",
  postalCode: "郵便番号",
  prefecture: "都道府県",
  city: "市区町村",
  line1: "番地・建物名",
};

export const DEFAULT_CHECKOUT_FIELD_ORDER: CheckoutFieldKey[] = [...CHECKOUT_FIELD_KEYS];

/** 郵便番号〜番地・建物名は常に1画面にまとめて表示するため、ひとつの塊として扱う。 */
export const ADDRESS_FIELD_KEYS: CheckoutFieldKey[] = ["postalCode", "prefecture", "city", "line1"];
export const ADDRESS_KEY_SET = new Set<CheckoutFieldKey>(ADDRESS_FIELD_KEYS);
