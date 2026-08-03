import type { Address, OrderType, PaymentMethod, SubscriptionInterval } from "@/lib/types";

export interface WidgetProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  list_price: number | null;
  price_label: string | null;
  shipping_fee: number;
  image_url: string | null;
  order_type: "one_time" | "subscription";
  subscription_intervals: SubscriptionInterval[];
}

export interface WidgetScenarioNode {
  id: string;
  scenario_id: string;
  type: "message" | "choice" | "product" | "checkout" | "product_qa";
  content: Record<string, unknown>;
  next_node_map: Record<string, string>;
  is_entry: boolean;
}

export interface ChatMessage {
  id: string;
  from: "bot" | "user";
  kind: "text" | "product" | "checkout" | "faq" | "checkout-result";
  text?: string;
  imageUrl?: string;
  productId?: string;
  nodeId?: string;
  breakdown?: { amount: number; shippingFee: number; paymentFee: number; total: number };
  resultOk?: boolean;
}

export interface CheckoutCustomerInput {
  name: string;
  email: string;
  phone: string;
  address: Address;
}

export interface CheckoutSelection {
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  subscriptionInterval?: SubscriptionInterval;
}
