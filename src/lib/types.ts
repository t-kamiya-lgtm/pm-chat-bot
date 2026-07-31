export type UserRole = "admin" | "staff" | "unassigned";

export interface AppUser {
  id: string;
  authUserId: string | null;
  email: string;
  role: UserRole;
  createdAt: string;
}

export type SubscriptionInterval = "biweekly" | "monthly" | "bimonthly";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  shippingFee: number;
  imageUrl: string | null;
  smaregiProductId: string | null;
  isSubscriptionAvailable: boolean;
  subscriptionIntervals: SubscriptionInterval[];
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSpec {
  id: string;
  productId: string;
  ingredients: string | null;
  allergens: string | null;
  volume: string | null;
  usage: string | null;
  extra: Record<string, unknown>;
  updatedAt: string;
}

export type ProductFaqStatus = "draft" | "published" | "rejected";

export interface ProductFaq {
  id: string;
  productId: string;
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
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScenarioNodeType =
  | "message"
  | "choice"
  | "product"
  | "checkout"
  | "product_qa";

export interface ScenarioNode {
  id: string;
  scenarioId: string;
  type: ScenarioNodeType;
  content: Record<string, unknown>;
  nextNodeMap: Record<string, string>;
  isEntry: boolean;
  createdAt: string;
}

export interface Address {
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
  line2?: string;
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

export type OrderType = "one_time" | "subscription";
export type PaymentMethod = "stripe" | "deferred_invoice" | "cod";
export type OrderStatus = "pending" | "accepted" | "paid" | "failed" | "canceled";

export interface Order {
  id: string;
  customerId: string;
  productId: string;
  type: OrderType;
  paymentMethod: PaymentMethod;
  amount: number;
  shippingFee: number;
  paymentFee: number;
  status: OrderStatus;
  stripePaymentIntentId: string | null;
  stripeSubscriptionId: string | null;
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
