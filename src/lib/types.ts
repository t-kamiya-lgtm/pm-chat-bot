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
  price: number;
  listPrice: number | null;
  priceLabel: string | null;
  shippingFee: number;
  imageUrl: string | null;
  imageUrls: string[];
  smaregiProductId: string | null;
  orderType: ProductOrderType;
  subscriptionIntervals: SubscriptionInterval[];
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: string;
  updatedAt: string;
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
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MenuItemActionType = "node" | "url";

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
  | "survey";

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
