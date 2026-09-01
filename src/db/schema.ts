import { pgTable, unique, check, uuid, text, timestamp, uniqueIndex, foreignKey, integer, boolean, jsonb, index, date, smallint, numeric, primaryKey, pgSequence } from "drizzle-orm/pg-core"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const customerNumberSeq = pgSequence("customer_number_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	authUserId: text("auth_user_id"),
	email: text().notNull(),
	role: text().default('unassigned').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_auth_user_id_key").on(table.authUserId),
	unique("users_email_key").on(table.email),
	check("users_role_check", sql`role = ANY (ARRAY['admin'::text, 'staff'::text, 'unassigned'::text])`),
]);

export const scenarios = pgTable("scenarios", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	status: text().default('draft').notNull(),
	version: integer().default(1).notNull(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	displayOrder: integer("display_order").default(0),
	slug: text(),
	orderCode: text("order_code"),
	chatBackgroundColor: text("chat_background_color"),
	menuBackgroundColor: text("menu_background_color"),
	messageBackgroundColor: text("message_background_color"),
	headerMode: text("header_mode"),
	headerImageUrl: text("header_image_url"),
	headerTitle: text("header_title"),
	headerBackgroundColor: text("header_background_color"),
	userMessageBackgroundColor: text("user_message_background_color"),
	headerTextColor: text("header_text_color"),
	messageTextColor: text("message_text_color"),
	userMessageTextColor: text("user_message_text_color"),
	menuTextColor: text("menu_text_color"),
	adTag: text("ad_tag"),
	popupIconUrl: text("popup_icon_url"),
	popupPosition: text("popup_position"),
	couponCodeFieldEnabled: boolean("coupon_code_field_enabled").default(true).notNull(),
	conversionTag: text("conversion_tag"),
	emailFromAddress: text("email_from_address"),
	inquiryReceiveEmail: text("inquiry_receive_email"),
	inquiryAutoReplyFrom: text("inquiry_auto_reply_from"),
	orderConfirmationFrom: text("order_confirmation_from"),
	abandonedReminderFrom: text("abandoned_reminder_from"),
	cancellationFrom: text("cancellation_from"),
	shipmentCompleteFrom: text("shipment_complete_from"),
	menuLayoutKey: text("menu_layout_key").default('row-3').notNull(),
	menuImageUrl: text("menu_image_url"),
	popupButtonText: text("popup_button_text"),
}, (table) => [
	uniqueIndex("scenarios_slug_key").using("btree", table.slug.asc().nullsLast().op("text_ops")).where(sql`(slug IS NOT NULL)`),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "scenarios_created_by_fkey"
		}),
	check("scenarios_status_check", sql`status = ANY (ARRAY['draft'::text, 'published'::text])`),
	check("scenarios_popup_position_check", sql`(popup_position IS NULL) OR (popup_position = ANY (ARRAY['bottom-right'::text, 'bottom-left'::text]))`),
	check("scenarios_header_mode_check", sql`(header_mode IS NULL) OR (header_mode = ANY (ARRAY['image'::text, 'title'::text]))`),
	check("scenarios_header_text_color_check", sql`(header_text_color IS NULL) OR (header_text_color = ANY (ARRAY['white'::text, 'black'::text]))`),
	check("scenarios_message_text_color_check", sql`(message_text_color IS NULL) OR (message_text_color = ANY (ARRAY['white'::text, 'black'::text]))`),
	check("scenarios_user_message_text_color_check", sql`(user_message_text_color IS NULL) OR (user_message_text_color = ANY (ARRAY['white'::text, 'black'::text]))`),
	check("scenarios_menu_text_color_check", sql`(menu_text_color IS NULL) OR (menu_text_color = ANY (ARRAY['white'::text, 'black'::text]))`),
]);

export const paymentMethodFees = pgTable("payment_method_fees", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	paymentMethod: text("payment_method").notNull(),
	orderType: text("order_type"),
	fee: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("payment_method_fees_payment_method_order_type_key").on(table.paymentMethod, table.orderType),
	check("payment_method_fees_payment_method_check", sql`payment_method = ANY (ARRAY['cod'::text, 'deferred_invoice'::text])`),
	check("payment_method_fees_order_type_check", sql`order_type = ANY (ARRAY['one_time'::text, 'subscription'::text])`),
	check("payment_method_fees_fee_check", sql`fee >= 0`),
]);

export const productSpecs = pgTable("product_specs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id"),
	ingredients: text(),
	allergens: text(),
	volume: text(),
	usage: text(),
	extra: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	productGroupId: uuid("product_group_id"),
	nutrition: text(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_specs_product_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productGroupId],
			foreignColumns: [productGroups.id],
			name: "product_specs_product_group_id_fkey"
		}),
	unique("product_specs_product_id_key").on(table.productId),
	unique("product_specs_product_group_id_key").on(table.productGroupId),
]);

export const productFaqs = pgTable("product_faqs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id"),
	question: text().notNull(),
	answer: text().notNull(),
	status: text().default('draft').notNull(),
	source: text().default('generated').notNull(),
	generatedFromSpecId: uuid("generated_from_spec_id"),
	reviewedBy: uuid("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	productGroupId: uuid("product_group_id"),
	categoryId: uuid("category_id"),
}, (table) => [
	index("idx_product_faqs_category_id").using("btree", table.categoryId.asc().nullsLast().op("uuid_ops")),
	index("idx_product_faqs_group_id_status").using("btree", table.productGroupId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_product_faqs_product_id_status").using("btree", table.productId.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_faqs_product_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.generatedFromSpecId],
			foreignColumns: [productSpecs.id],
			name: "product_faqs_generated_from_spec_id_fkey"
		}),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "product_faqs_reviewed_by_fkey"
		}),
	foreignKey({
			columns: [table.productGroupId],
			foreignColumns: [productGroups.id],
			name: "product_faqs_product_group_id_fkey"
		}),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [productFaqCategories.id],
			name: "product_faqs_category_id_fkey"
		}),
	check("product_faqs_status_check", sql`status = ANY (ARRAY['draft'::text, 'published'::text, 'rejected'::text])`),
	check("product_faqs_source_check", sql`source = ANY (ARRAY['generated'::text, 'manual'::text])`),
]);

export const scenarioNodes = pgTable("scenario_nodes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scenarioId: uuid("scenario_id").notNull(),
	type: text().notNull(),
	content: jsonb().default({}).notNull(),
	nextNodeMap: jsonb("next_node_map").default({}).notNull(),
	isEntry: boolean("is_entry").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	displayOrder: integer("display_order").default(0),
	memo: text(),
}, (table) => [
	index("idx_scenario_nodes_scenario_id").using("btree", table.scenarioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "scenario_nodes_scenario_id_fkey"
		}).onDelete("cascade"),
	check("scenario_nodes_type_check", sql`type = ANY (ARRAY['message'::text, 'choice'::text, 'product'::text, 'checkout'::text, 'product_qa'::text, 'image'::text, 'survey'::text, 'video'::text, 'coupon'::text])`),
]);

export const customers = pgTable("customers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	name: text().notNull(),
	phone: text(),
	address: jsonb(),
	smaregiMemberId: text("smaregi_member_id"),
	stripeCustomerId: text("stripe_customer_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	customerNumber: integer("customer_number"),
	smaregiSyncedAt: timestamp("smaregi_synced_at", { withTimezone: true, mode: 'string' }),
	nameKana: text("name_kana"),
	gender: text(),
	birthDate: date("birth_date"),
}, (table) => [
	unique("customers_email_key").on(table.email),
	unique("customers_customer_number_key").on(table.customerNumber),
]);

export const smaregiSyncLogs = pgTable("smaregi_sync_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: uuid("order_id"),
	payload: jsonb().notNull(),
	status: text().default('ok').notNull(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "smaregi_sync_logs_order_id_fkey"
		}).onDelete("cascade"),
	check("smaregi_sync_logs_status_check", sql`status = ANY (ARRAY['ok'::text, 'error'::text])`),
]);

export const coreSystemSyncLogs = pgTable("core_system_sync_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	orderId: uuid("order_id"),
	payload: jsonb().notNull(),
	status: text().default('ok').notNull(),
	error: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "core_system_sync_logs_order_id_fkey"
		}).onDelete("cascade"),
	check("core_system_sync_logs_status_check", sql`status = ANY (ARRAY['ok'::text, 'error'::text])`),
]);

export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	// orders/subscriptionItemsとの循環参照(subscriptions -> orders -> subscriptionItems -> subscriptions)
	// をTypeScriptの型推論が解決できるよう、このFKだけ明示的な戻り値型付きの参照にしている。
	orderId: uuid("order_id").notNull().references((): AnyPgColumn => orders.id, { onDelete: "cascade" }),
	interval: text().notNull(),
	nextBillingDate: date("next_billing_date"),
	status: text().default('active').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	overrideProductId: uuid("override_product_id"),
	overrideQuantity: integer("override_quantity"),
	overrideAmount: integer("override_amount"),
	overrideShippingFee: integer("override_shipping_fee"),
	overridePaymentFee: integer("override_payment_fee"),
	overridePaymentMethod: text("override_payment_method"),
}, (table) => [
	foreignKey({
			columns: [table.overrideProductId],
			foreignColumns: [products.id],
			name: "subscriptions_override_product_id_fkey"
		}),
	check("subscriptions_status_check", sql`status = ANY (ARRAY['active'::text, 'paused'::text, 'canceled'::text])`),
	check("subscriptions_override_payment_method_check", sql`override_payment_method = ANY (ARRAY['cod'::text, 'deferred_invoice'::text])`),
]);

export const productFaqCategories = pgTable("product_faq_categories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productGroupId: uuid("product_group_id").notNull(),
	title: text().notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_product_faq_categories_group_id").using("btree", table.productGroupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.productGroupId],
			foreignColumns: [productGroups.id],
			name: "product_faq_categories_product_group_id_fkey"
		}).onDelete("cascade"),
]);

export const productGroups = pgTable("product_groups", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	parentCode: text("parent_code"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	brandId: uuid("brand_id"),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "product_groups_created_by_fkey"
		}),
	foreignKey({
			columns: [table.brandId],
			foreignColumns: [brands.id],
			name: "product_groups_brand_id_fkey"
		}).onDelete("set null"),
]);

export const businessClosedDates = pgTable("business_closed_dates", {
	date: date().primaryKey().notNull(),
	reason: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const checkoutMessages = pgTable("checkout_messages", {
	id: smallint().default(1).primaryKey().notNull(),
	greeting: text(),
	completionMessage: text("completion_message"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	termsText: text("terms_text"),
	privacyText: text("privacy_text"),
	greetingItems: jsonb("greeting_items").default([]).notNull(),
	completionItems: jsonb("completion_items").default([]).notNull(),
	privacyNotice: text("privacy_notice"),
	shoppingGuideText: text("shopping_guide_text"),
}, (table) => [
	check("checkout_messages_id_check", sql`id = 1`),
]);

export const productSetOptions = pgTable("product_set_options", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productId: uuid("product_id").notNull(),
	optionProductId: uuid("option_product_id").notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("product_set_options_product_id_idx").using("btree", table.productId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_set_options_product_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.optionProductId],
			foreignColumns: [products.id],
			name: "product_set_options_option_product_id_fkey"
		}).onDelete("cascade"),
	unique("product_set_options_product_id_option_product_id_key").on(table.productId, table.optionProductId),
	check("product_set_options_no_self_reference", sql`product_id <> option_product_id`),
]);

export const customerViewLogs = pgTable("customer_view_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	customerId: uuid("customer_id").notNull(),
	viewedByUserId: uuid("viewed_by_user_id"),
	viewedByEmail: text("viewed_by_email").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_customer_view_logs_customer_id").using("btree", table.customerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "customer_view_logs_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.viewedByUserId],
			foreignColumns: [users.id],
			name: "customer_view_logs_viewed_by_user_id_fkey"
		}),
]);

export const leads = pgTable("leads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: text("session_id").notNull(),
	name: text(),
	phone: text(),
	email: text(),
	productId: uuid("product_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	surveyResponses: jsonb("survey_responses"),
	orderStatus: text("order_status").default('abandoned').notNull(),
	contactedPhone: boolean("contacted_phone").default(false).notNull(),
	contactedEmail: boolean("contacted_email").default(false).notNull(),
	contactedSms: boolean("contacted_sms").default(false).notNull(),
	abandonedEmailSentAt: timestamp("abandoned_email_sent_at", { withTimezone: true, mode: 'string' }),
	unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true, mode: 'string' }),
	scenarioId: uuid("scenario_id"),
}, (table) => [
	index("idx_leads_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "leads_product_id_fkey"
		}),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "leads_scenario_id_fkey"
		}).onDelete("set null"),
	unique("leads_session_id_key").on(table.sessionId),
	check("leads_order_status_check", sql`order_status = ANY (ARRAY['ordered'::text, 'abandoned'::text])`),
]);

export const scenarioAccessLogs = pgTable("scenario_access_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scenarioId: uuid("scenario_id"),
	sessionId: text("session_id").notNull(),
	utmSource: text("utm_source"),
	utmMedium: text("utm_medium"),
	utmCampaign: text("utm_campaign"),
	referrer: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("scenario_access_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("scenario_access_logs_scenario_id_idx").using("btree", table.scenarioId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("scenario_access_logs_session_id_key").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "scenario_access_logs_scenario_id_fkey"
		}).onDelete("set null"),
]);

export const emailTemplates = pgTable("email_templates", {
	id: smallint().default(1).primaryKey().notNull(),
	orderCompletionSubject: text("order_completion_subject").default("").notNull(),
	orderCompletionBody: text("order_completion_body").default("").notNull(),
	abandonedLeadSubject: text("abandoned_lead_subject").default("").notNull(),
	abandonedLeadBody: text("abandoned_lead_body").default("").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	renewalSubject: text("renewal_subject").default("").notNull(),
	renewalBody: text("renewal_body").default("").notNull(),
	inquiryAutoReplySubject: text("inquiry_auto_reply_subject"),
	inquiryAutoReplyBody: text("inquiry_auto_reply_body"),
	cancellationSubject: text("cancellation_subject"),
	cancellationBody: text("cancellation_body"),
	shipmentCompleteSubject: text("shipment_complete_subject"),
	shipmentCompleteBody: text("shipment_complete_body"),
}, (table) => [
	check("email_templates_id_check", sql`id = 1`),
]);

export const smaregiOauthTokens = pgTable("smaregi_oauth_tokens", {
	id: smallint().default(1).primaryKey().notNull(),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("smaregi_oauth_tokens_id_check", sql`id = 1`),
]);

export const subscriptionItems = pgTable("subscription_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	subscriptionId: uuid("subscription_id").notNull(),
	productId: uuid("product_id").notNull(),
	quantity: integer().default(1).notNull(),
	unitAmount: integer("unit_amount").notNull(),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	removedAt: timestamp("removed_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_subscription_items_subscription_id").using("btree", table.subscriptionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [subscriptions.id],
			name: "subscription_items_subscription_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "subscription_items_product_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "subscription_items_created_by_fkey"
		}),
]);

export const brands = pgTable("brands", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	code: text(),
}, (table) => [
	uniqueIndex("brands_code_unique").using("btree", table.code.asc().nullsLast().op("text_ops")).where(sql`(code IS NOT NULL)`),
]);

export const scenarioMenuItems = pgTable("scenario_menu_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scenarioId: uuid("scenario_id").notNull(),
	label: text().notNull(),
	actionType: text("action_type").notNull(),
	targetNodeId: uuid("target_node_id"),
	url: text(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("scenario_menu_items_scenario_id_idx").using("btree", table.scenarioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "scenario_menu_items_scenario_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetNodeId],
			foreignColumns: [scenarioNodes.id],
			name: "scenario_menu_items_target_node_id_fkey"
		}).onDelete("set null"),
	check("scenario_menu_items_action_type_check", sql`action_type = ANY (ARRAY['node'::text, 'url'::text, 'business_calendar'::text, 'shopping_guide'::text])`),
]);

export const coupons = pgTable("coupons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	type: text().notNull(),
	scenarioId: uuid("scenario_id"),
	code: text(),
	name: text().notNull(),
	discountType: text("discount_type").notNull(),
	discountValue: integer("discount_value").notNull(),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }),
	maxUses: integer("max_uses"),
	usedCount: integer("used_count").default(0).notNull(),
	minOrderAmount: integer("min_order_amount"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	imageUrl: text("image_url"),
	promoMessage: text("promo_message"),
	targetProductIds: uuid("target_product_ids").array(),
}, (table) => [
	uniqueIndex("coupons_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")).where(sql`(code IS NOT NULL)`),
	index("coupons_scenario_id_idx").using("btree", table.scenarioId.asc().nullsLast().op("uuid_ops")).where(sql`(scenario_id IS NOT NULL)`),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "coupons_scenario_id_fkey"
		}).onDelete("cascade"),
	check("coupons_type_check", sql`type = ANY (ARRAY['scenario_auto'::text, 'manual_code'::text])`),
	check("coupons_discount_type_check", sql`discount_type = ANY (ARRAY['percent'::text, 'fixed'::text])`),
	check("coupons_discount_value_check", sql`discount_value > 0`),
	check("coupons_max_uses_check", sql`(max_uses IS NULL) OR (max_uses > 0)`),
	check("coupons_min_order_amount_check", sql`(min_order_amount IS NULL) OR (min_order_amount >= 0)`),
	check("coupons_scenario_auto_has_scenario", sql`((type = 'scenario_auto'::text) AND (scenario_id IS NOT NULL)) OR ((type = 'manual_code'::text) AND (scenario_id IS NULL))`),
	check("coupons_manual_code_has_code", sql`((type = 'manual_code'::text) AND (code IS NOT NULL)) OR ((type = 'scenario_auto'::text) AND (code IS NULL))`),
]);

export const customerChangeLogs = pgTable("customer_change_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	customerId: uuid("customer_id").notNull(),
	subscriptionId: uuid("subscription_id"),
	action: text().notNull(),
	changes: jsonb().default([]).notNull(),
	changedByEmail: text("changed_by_email").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_customer_change_logs_customer_id").using("btree", table.customerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "customer_change_logs_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [subscriptions.id],
			name: "customer_change_logs_subscription_id_fkey"
		}).onDelete("set null"),
]);

export const bundleInsertItems = pgTable("bundle_insert_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	brandId: uuid("brand_id").notNull(),
	itemType: text("item_type").notNull(),
	name: text().notNull(),
	registeredDate: date("registered_date").default(sql`CURRENT_DATE`).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	url: text(),
	status: text().default('active').notNull(),
}, (table) => [
	index("idx_bundle_insert_items_brand_id").using("btree", table.brandId.asc().nullsLast().op("uuid_ops")),
	index("idx_bundle_insert_items_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.brandId],
			foreignColumns: [brands.id],
			name: "bundle_insert_items_brand_id_fkey"
		}).onDelete("cascade"),
	check("bundle_insert_items_status_check", sql`status = ANY (ARRAY['active'::text, 'inactive'::text])`),
]);

export const retentionCampaignTypes = pgTable("retention_campaign_types", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	brandId: uuid("brand_id").notNull(),
	title: text().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_retention_campaign_types_brand_id").using("btree", table.brandId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.brandId],
			foreignColumns: [brands.id],
			name: "retention_campaign_types_brand_id_fkey"
		}).onDelete("cascade"),
]);

export const customerRetentionActions = pgTable("customer_retention_actions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	customerId: uuid("customer_id").notNull(),
	subscriptionId: uuid("subscription_id"),
	campaignTypeId: uuid("campaign_type_id").notNull(),
	performedMonth: date("performed_month").notNull(),
	detail: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_customer_retention_actions_campaign_type_id").using("btree", table.campaignTypeId.asc().nullsLast().op("uuid_ops")),
	index("idx_customer_retention_actions_customer_id").using("btree", table.customerId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "customer_retention_actions_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [subscriptions.id],
			name: "customer_retention_actions_subscription_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.campaignTypeId],
			foreignColumns: [retentionCampaignTypes.id],
			name: "customer_retention_actions_campaign_type_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "customer_retention_actions_created_by_fkey"
		}),
]);

export const productGroupTaxRates = pgTable("product_group_tax_rates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	productGroupId: uuid("product_group_id").notNull(),
	taxRateId: uuid("tax_rate_id").notNull(),
	periodStart: date("period_start").notNull(),
	periodEnd: date("period_end"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_product_group_tax_rates_group_id").using("btree", table.productGroupId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.productGroupId],
			foreignColumns: [productGroups.id],
			name: "product_group_tax_rates_product_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.taxRateId],
			foreignColumns: [taxRates.id],
			name: "product_group_tax_rates_tax_rate_id_fkey"
		}),
]);

export const taxRates = pgTable("tax_rates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	rate: numeric({ precision: 5, scale:  4 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("tax_rates_rate_check", sql`rate >= (0)::numeric`),
]);

export const bundleInsertSets = pgTable("bundle_insert_sets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	brandId: uuid("brand_id").notNull(),
	name: text().notNull(),
	insertLabel: text("insert_label"),
	periodStart: date("period_start").notNull(),
	periodEnd: date("period_end"),
	targetOrderType: text("target_order_type").default('both').notNull(),
	targetCycleNumbers: integer("target_cycle_numbers").array(),
	targetProductIds: uuid("target_product_ids").array(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: text().default('active').notNull(),
	itemIds: uuid("item_ids").array(),
}, (table) => [
	index("idx_bundle_insert_sets_brand_id").using("btree", table.brandId.asc().nullsLast().op("uuid_ops")),
	index("idx_bundle_insert_sets_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.brandId],
			foreignColumns: [brands.id],
			name: "bundle_insert_sets_brand_id_fkey"
		}).onDelete("cascade"),
	check("bundle_insert_sets_status_check", sql`status = ANY (ARRAY['active'::text, 'draft'::text])`),
	check("bundle_insert_sets_target_order_type_check", sql`target_order_type = ANY (ARRAY['subscription'::text, 'one_time'::text, 'both'::text])`),
]);

export const products = pgTable("products", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	price: integer().notNull(),
	shippingFee: integer("shipping_fee").default(0).notNull(),
	imageUrl: text("image_url"),
	smaregiProductId: text("smaregi_product_id"),
	subscriptionIntervals: jsonb("subscription_intervals").default([]).notNull(),
	stripeProductId: text("stripe_product_id"),
	stripePriceId: text("stripe_price_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	productGroupId: uuid("product_group_id"),
	orderType: text("order_type").default('one_time').notNull(),
	listPrice: integer("list_price"),
	priceLabel: text("price_label"),
	displayOrder: integer("display_order").default(0).notNull(),
	imageUrls: text("image_urls").array().default([""]).notNull(),
	isMailDeliverable: boolean("is_mail_deliverable").default(false).notNull(),
	memo: text(),
	isSet: boolean("is_set").default(false).notNull(),
	setItemCount: integer("set_item_count"),
	isActive: boolean("is_active").default(true).notNull(),
	taxRate: smallint("tax_rate").default(8).notNull(),
	firstTimePrice: integer("first_time_price"),
	comparePriceType: text("compare_price_type").default('none').notNull(),
	unitTotalPrice: integer("unit_total_price"),
	customCompareLabel: text("custom_compare_label"),
	customComparePrice: integer("custom_compare_price"),
	costAmount: integer("cost_amount").default(0).notNull(),
	bundleInsertCost: integer("bundle_insert_cost").default(0).notNull(),
	shippingCost: integer("shipping_cost").default(0).notNull(),
	salesCommissionAmount: integer("sales_commission_amount").default(0).notNull(),
	nextCycleProductId: uuid("next_cycle_product_id"),
	nextCycleInterval: text("next_cycle_interval"),
}, (table) => [
	index("idx_products_product_group_id").using("btree", table.productGroupId.asc().nullsLast().op("uuid_ops")),
	index("idx_products_smaregi_product_id").using("btree", table.smaregiProductId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "products_created_by_fkey"
		}),
	foreignKey({
			columns: [table.productGroupId],
			foreignColumns: [productGroups.id],
			name: "products_product_group_id_fkey"
		}),
	foreignKey({
			columns: [table.nextCycleProductId],
			foreignColumns: [table.id],
			name: "products_next_cycle_product_id_fkey"
		}),
	check("products_price_check", sql`price >= 0`),
	check("products_shipping_fee_check", sql`shipping_fee >= 0`),
	check("products_order_type_check", sql`order_type = ANY (ARRAY['one_time'::text, 'subscription'::text])`),
	check("products_set_item_count_check", sql`(set_item_count IS NULL) OR (set_item_count > 0)`),
	check("products_tax_rate_check", sql`tax_rate = ANY (ARRAY[8, 10])`),
	check("products_compare_price_type_check", sql`compare_price_type = ANY (ARRAY['none'::text, 'list_price'::text, 'unit_total'::text, 'custom'::text])`),
	check("products_cost_amount_check", sql`cost_amount >= 0`),
	check("products_bundle_insert_cost_check", sql`bundle_insert_cost >= 0`),
	check("products_shipping_cost_check", sql`shipping_cost >= 0`),
	check("products_sales_commission_amount_check", sql`sales_commission_amount >= 0`),
	check("products_next_cycle_interval_check", sql`next_cycle_interval = ANY (ARRAY['biweekly'::text, 'monthly'::text, 'bimonthly'::text])`),
]);

export const orders = pgTable("orders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	customerId: uuid("customer_id").notNull(),
	productId: uuid("product_id").notNull(),
	type: text().notNull(),
	paymentMethod: text("payment_method").notNull(),
	amount: integer().notNull(),
	shippingFee: integer("shipping_fee").default(0).notNull(),
	paymentFee: integer("payment_fee").default(0).notNull(),
	status: text().default('pending').notNull(),
	stripePaymentIntentId: text("stripe_payment_intent_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deliveryDate: date("delivery_date"),
	deliveryTimeSlot: text("delivery_time_slot"),
	agreedTermsAt: timestamp("agreed_terms_at", { withTimezone: true, mode: 'string' }),
	addonProductId: uuid("addon_product_id"),
	addonAmount: integer("addon_amount"),
	shippingAddress: jsonb("shipping_address"),
	surveyResponses: jsonb("survey_responses"),
	quantity: integer().default(1).notNull(),
	importStatus: text("import_status").default('not_imported').notNull(),
	importStatusUpdatedAt: timestamp("import_status_updated_at", { withTimezone: true, mode: 'string' }),
	scenarioId: uuid("scenario_id"),
	orderNumber: text("order_number"),
	sessionId: text("session_id"),
	utmSource: text("utm_source"),
	utmMedium: text("utm_medium"),
	utmCampaign: text("utm_campaign"),
	couponId: uuid("coupon_id"),
	couponCode: text("coupon_code"),
	discountAmount: integer("discount_amount").default(0).notNull(),
	setSelections: jsonb("set_selections"),
	completionEmailSentAt: timestamp("completion_email_sent_at", { withTimezone: true, mode: 'string' }),
	parentOrderId: uuid("parent_order_id").references((): AnyPgColumn => orders.id),
	billingCycleNumber: integer("billing_cycle_number").default(1).notNull(),
	firstTimeDiscountAmount: integer("first_time_discount_amount"),
	isAddonSubscription: boolean("is_addon_subscription").default(false).notNull(),
	shippedAt: timestamp("shipped_at", { withTimezone: true, mode: 'string' }),
	carrierName: text("carrier_name"),
	trackingNumber: text("tracking_number"),
	cancellationEmailSentAt: timestamp("cancellation_email_sent_at", { withTimezone: true, mode: 'string' }),
	shipmentEmailSentAt: timestamp("shipment_email_sent_at", { withTimezone: true, mode: 'string' }),
	invoiceNote: text("invoice_note"),
	subscriptionItemId: uuid("subscription_item_id"),
	costAmount: integer("cost_amount"),
	bundleInsertCost: integer("bundle_insert_cost"),
	shippingCost: integer("shipping_cost"),
	salesCommissionAmount: integer("sales_commission_amount"),
	taxRate: numeric("tax_rate", { precision: 5, scale:  4 }),
}, (table) => [
	index("idx_orders_customer_id").using("btree", table.customerId.asc().nullsLast().op("uuid_ops")),
	index("idx_orders_stripe_payment_intent_id").using("btree", table.stripePaymentIntentId.asc().nullsLast().op("text_ops")),
	index("idx_orders_stripe_subscription_id").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "orders_customer_id_fkey"
		}),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "orders_product_id_fkey"
		}),
	foreignKey({
			columns: [table.addonProductId],
			foreignColumns: [products.id],
			name: "orders_addon_product_id_fkey"
		}),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "orders_scenario_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.couponId],
			foreignColumns: [coupons.id],
			name: "orders_coupon_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.subscriptionItemId],
			foreignColumns: [subscriptionItems.id],
			name: "orders_subscription_item_id_fkey"
		}),
	check("orders_type_check", sql`type = ANY (ARRAY['one_time'::text, 'subscription'::text])`),
	check("orders_payment_method_check", sql`payment_method = ANY (ARRAY['stripe'::text, 'deferred_invoice'::text, 'cod'::text])`),
	check("orders_amount_check", sql`amount >= 0`),
	check("orders_status_check", sql`status = ANY (ARRAY['pending'::text, 'accepted'::text, 'paid'::text, 'failed'::text, 'canceled'::text])`),
	check("orders_import_status_check", sql`import_status = ANY (ARRAY['imported'::text, 'on_hold'::text, 'not_imported'::text, 'import_error'::text, 'excluded'::text, 'shipped'::text, 'canceled'::text])`),
]);

export const checkoutFieldOrder = pgTable("checkout_field_order", {
	fieldKey: text("field_key").notNull(),
	displayOrder: integer("display_order").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	scenarioId: uuid("scenario_id").notNull(),
}, (table) => [
	index("checkout_field_order_scenario_id_idx").using("btree", table.scenarioId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.scenarioId],
			foreignColumns: [scenarios.id],
			name: "checkout_field_order_scenario_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.fieldKey, table.scenarioId], name: "checkout_field_order_pkey"}),
]);
