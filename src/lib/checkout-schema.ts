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
  email: z.string().email(),
  phone: z.string().optional(),
  address: addressSchema,
});

/** 注文者と別の住所へ届ける場合のお届け先(任意)。 */
export const shippingAddressSchema = addressSchema.extend({
  recipientName: z.string().min(1),
  recipientPhone: z.string().min(1),
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
  agreedTerms: z.literal(true),
  agreedPrivacy: z.literal(true),
  addonProductId: z.string().uuid().optional(),
  shippingAddress: shippingAddressSchema.optional(),
});

export const deferredCheckoutSchema = checkoutBaseSchema.extend({
  paymentMethod: z.enum(["deferred_invoice", "cod"]),
});
