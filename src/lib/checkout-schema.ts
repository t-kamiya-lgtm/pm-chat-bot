import { z } from "zod";

export const addressSchema = z.object({
  postalCode: z.string().min(1),
  prefecture: z.string().min(1),
  city: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
});

export const customerInputSchema = z.object({
  name: z.string().min(1),
  nameKana: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  /** 任意回答。 */
  gender: z.string().optional(),
  /** 任意回答("YYYY-MM-DD")。 */
  birthDate: z.string().optional(),
  address: addressSchema,
});

/** 注文者と別の住所へ届ける場合のお届け先(任意)。 */
export const shippingAddressSchema = addressSchema.extend({
  recipientName: z.string().min(1),
  recipientPhone: z.string().min(1),
  recipientNameKana: z.string().min(1),
});

export const subscriptionIntervalSchema = z.enum(["biweekly", "monthly", "bimonthly"]);

export const checkoutBaseSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  orderType: z.enum(["one_time", "subscription"]),
  subscriptionInterval: subscriptionIntervalSchema.optional(),
  customer: customerInputSchema,
  deliveryDate: z.string().optional(),
  deliveryTimeSlot: z.string().optional(),
  /** 送り状への記載内容の指示(任意)。 */
  invoiceNote: z.string().max(40).optional(),
  agreedTerms: z.literal(true),
  agreedPrivacy: z.literal(true),
  addonProductId: z.string().uuid().optional(),
  shippingAddress: shippingAddressSchema.optional(),
  surveyResponses: z.record(z.string(), z.string()).optional(),
  scenarioId: z.string().uuid().optional(),
  sessionId: z.string().min(1).optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  couponCode: z.string().optional(),
  setSelections: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

export const deferredCheckoutSchema = checkoutBaseSchema.extend({
  paymentMethod: z.enum(["deferred_invoice", "cod"]),
});
