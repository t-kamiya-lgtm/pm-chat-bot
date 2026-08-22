export type UserRole = "admin" | "staff" | "unassigned";

export interface AppUser {
  id: string;
  authUserId: string | null;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type SubscriptionInterval = "biweekly" | "monthly" | "bimonthly";
export type ProductOrderType = "one_time" | "subscription";
export type ComparePriceType = "none" | "list_price" | "unit_total" | "custom";

/** 商品種類(親品番)。QA・仕様情報はこちらに紐づく。 */
export interface ProductGroup {
  id: string;
  name: string;
  parentCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  productGroupId: string | null;
  name: string;
  description: string | null;
  memo: string | null;
  price: number;
  listPrice: number | null;
  /** 定期購入の初回のみ適用する特別価格(任意)。2回目以降はpriceを使う。 */
  firstTimePrice: number | null;
  /** 二重価格表記(打消線)で使う比較価格のラベル種別。 */
  comparePriceType: ComparePriceType;
  /** compareType="unit_total"のときの、手入力の単品合計価格。 */
  unitTotalPrice: number | null;
  /** compareType="custom"のときの、自由入力ラベル文言。 */
  customCompareLabel: string | null;
  /** compareType="custom"のときの、自由入力の比較価格。 */
  customComparePrice: number | null;
  priceLabel: string | null;
  taxRate: 8 | 10;
  shippingFee: number;
  imageUrl: string | null;
  imageUrls: string[];
  smaregiProductId: string | null;
  orderType: ProductOrderType;
  subscriptionIntervals: SubscriptionInterval[];
  stripeProductId: string | null;
  stripePriceId: string | null;
  isSet: boolean;
  setItemCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSetOption {
  id: string;
  productId: string;
  optionProductId: string;
  displayOrder: number;
}

export interface ProductSpec {
  id: string;
  productGroupId: string;
  ingredients: string | null;
  allergens: string | null;
  volume: string | null;
  usage: string | null;
  nutrition: string | null;
  extra: Record<string, unknown>;
  updatedAt: string;
}

/** 商品QAカテゴリ。商品種類(親品番)ごとに任意設定。 */
export interface ProductFaqCategory {
  id: string;
  productGroupId: string;
  title: string;
  displayOrder: number;
  createdAt: string;
}

export type ProductFaqStatus = "draft" | "published" | "rejected";

export interface ProductFaq {
  id: string;
  productGroupId: string;
  categoryId: string | null;
  question: string;
  answer: string;
  status: ProductFaqStatus;
  source: "generated" | "manual";
  generatedFromSpecId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export type ScenarioStatus = "draft" | "published";

export interface Scenario {
  id: string;
  name: string;
  status: ScenarioStatus;
  slug: string | null;
  orderCode: string | null;
  chatBackgroundColor: string | null;
  menuBackgroundColor: string | null;
  menuTextColor: "white" | "black" | null;
  messageBackgroundColor: string | null;
  messageTextColor: "white" | "black" | null;
  userMessageBackgroundColor: string | null;
  userMessageTextColor: "white" | "black" | null;
  headerMode: "image" | "title" | null;
  headerImageUrl: string | null;
  headerTitle: string | null;
  headerBackgroundColor: string | null;
  headerTextColor: "white" | "black" | null;
  adTag: string | null;
  conversionTag: string | null;
  emailFromAddress: string | null;
  inquiryReceiveEmail: string | null;
  inquiryAutoReplyFrom: string | null;
  orderConfirmationFrom: string | null;
  abandonedReminderFrom: string | null;
  cancellationFrom: string | null;
  shipmentCompleteFrom: string | null;
  popupIconUrl: string | null;
  popupPosition: "bottom-right" | "bottom-left" | null;
  couponCodeFieldEnabled: boolean;
  menuLayoutKey: string;
  menuImageUrl: string | null;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MenuItemActionType = "node" | "url" | "business_calendar" | "shopping_guide";

export interface ScenarioMenuItem {
  id: string;
  scenarioId: string;
  label: string;
  actionType: MenuItemActionType;
  targetNodeId: string | null;
  url: string | null;
  displayOrder: number;
}

export type ScenarioNodeType =
  | "message"
  | "choice"
  | "product"
  | "checkout"
  | "product_qa"
  | "image"
  | "survey"
  | "video"
  | "coupon";

export type SurveyAnswerType = "checkbox" | "radio" | "date" | "text_short" | "text_long";

export interface SurveyQuestion {
  label: string;
  required: boolean;
  /** 未設定(既存データ)の場合は "text_short" 扱い。 */
  type?: SurveyAnswerType;
  /** checkbox/radioの選択肢。 */
  options?: string[];
  /** checkbox/radioで「その他(自由入力)」を末尾に追加するか。 */
  allowOther?: boolean;
}

export interface ScenarioNode {
  id: string;
  scenarioId: string;
  type: ScenarioNodeType;
  content: Record<string, unknown>;
  nextNodeMap: Record<string, string>;
  isEntry: boolean;
  displayOrder: number;
  /** 管理用メモ。チャットボット画面には表示されない。 */
  memo: string | null;
  createdAt: string;
}

export interface Address {
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
  line2?: string;
}

/** 注文者と別の住所へ届ける場合のお届け先(任意)。 */
export interface ShippingAddress extends Address {
  recipientName: string;
  recipientPhone: string;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  address: Address | null;
  smaregiMemberId: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
}

export type OrderType = ProductOrderType;
export type PaymentMethod = "stripe" | "deferred_invoice" | "cod";
export type OrderStatus = "pending" | "accepted" | "paid" | "failed" | "canceled";

export interface Order {
  id: string;
  customerId: string;
  productId: string;
  type: OrderType;
  paymentMethod: PaymentMethod;
  amount: number;
  quantity: number;
  shippingFee: number;
  paymentFee: number;
  status: OrderStatus;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
  shippingAddress: ShippingAddress | null;
  surveyResponses: Record<string, string> | null;
  couponId: string | null;
  couponCode: string | null;
  discountAmount: number;
  setSelections: { id: string; name: string }[] | null;
  createdAt: string;
  updatedAt: string;
}

export type CouponType = "scenario_auto" | "manual_code";
export type CouponDiscountType = "percent" | "fixed";

export interface Coupon {
  id: string;
  type: CouponType;
  scenarioId: string | null;
  code: string | null;
  name: string;
  discountType: CouponDiscountType;
  discountValue: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  usedCount: number;
  minOrderAmount: number | null;
  isActive: boolean;
  /** クーポン表示ノードで使う告知画像(正方形または4:3横長推奨)。 */
  imageUrl: string | null;
  /** クーポン表示ノードで使う訴求メッセージ(例: 「お得なクーポンがあります」)。 */
  promoMessage: string | null;
  /**
   * 対象商品を限定する場合の品番一覧。null/空配列は制限なし(全商品に適用可能)。
   * カート内にこの一覧の商品が1つでも含まれることをゲート条件とし、他の条件
   * (最低注文金額など)は商品代金の合計に対して従来通り判定する。
   */
  targetProductIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

/** 決済フォームの挨拶文・注文確認メッセージの1項目(画像+リンク、またはコメント)。 */
export interface GreetingItem {
  type: "image" | "text";
  imageUrl?: string;
  linkUrl?: string;
  text?: string;
}

/** 入力途中で離脱した見込み客の情報。 */
export interface Lead {
  id: string;
  sessionId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  productId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSubscription {
  id: string;
  orderId: string;
  interval: string;
  nextBillingDate: string | null;
  status: "active" | "paused" | "canceled";
  createdAt: string;
  updatedAt: string;
}
