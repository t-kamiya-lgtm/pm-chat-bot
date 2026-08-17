import type { Address, OrderType, PaymentMethod, SubscriptionInterval } from "@/lib/types";

export interface WidgetSetOption {
  id: string;
  name: string;
  image_url: string | null;
}

export interface WidgetProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  list_price: number | null;
  first_time_price: number | null;
  price_label: string | null;
  shipping_fee: number;
  is_mail_deliverable: boolean;
  image_url: string | null;
  image_urls: string[];
  order_type: "one_time" | "subscription";
  subscription_intervals: SubscriptionInterval[];
  is_set: boolean;
  set_item_count: number | null;
  set_options: WidgetSetOption[];
}

export interface WidgetScenarioNode {
  id: string;
  scenario_id: string;
  type: "message" | "choice" | "product" | "checkout" | "product_qa" | "image" | "survey" | "video";
  content: Record<string, unknown>;
  next_node_map: Record<string, string>;
  is_entry: boolean;
  display_order: number;
}

export interface WidgetMenuItem {
  id: string;
  scenario_id: string;
  label: string;
  action_type: "node" | "url" | "business_calendar" | "shopping_guide";
  target_node_id: string | null;
  url: string | null;
  display_order: number;
}

export interface ChatMessage {
  id: string;
  from: "bot" | "user";
  kind: "text" | "product" | "checkout" | "faq" | "checkout-result";
  text?: string;
  imageUrl?: string;
  linkUrl?: string;
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
