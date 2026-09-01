import { relations } from "drizzle-orm/relations";
import { users, scenarios, products, productSpecs, productGroups, productFaqs, productFaqCategories, scenarioNodes, orders, smaregiSyncLogs, coreSystemSyncLogs, subscriptions, brands, productSetOptions, customers, customerViewLogs, leads, scenarioAccessLogs, subscriptionItems, scenarioMenuItems, coupons, customerChangeLogs, bundleInsertItems, retentionCampaignTypes, customerRetentionActions, productGroupTaxRates, taxRates, bundleInsertSets, checkoutFieldOrder } from "./schema";

export const scenariosRelations = relations(scenarios, ({one, many}) => ({
	user: one(users, {
		fields: [scenarios.createdBy],
		references: [users.id]
	}),
	scenarioNodes: many(scenarioNodes),
	leads: many(leads),
	scenarioAccessLogs: many(scenarioAccessLogs),
	scenarioMenuItems: many(scenarioMenuItems),
	coupons: many(coupons),
	orders: many(orders),
	checkoutFieldOrders: many(checkoutFieldOrder),
}));

export const usersRelations = relations(users, ({many}) => ({
	scenarios: many(scenarios),
	productFaqs: many(productFaqs),
	productGroups: many(productGroups),
	customerViewLogs: many(customerViewLogs),
	subscriptionItems: many(subscriptionItems),
	customerRetentionActions: many(customerRetentionActions),
	products: many(products),
}));

export const productSpecsRelations = relations(productSpecs, ({one, many}) => ({
	product: one(products, {
		fields: [productSpecs.productId],
		references: [products.id]
	}),
	productGroup: one(productGroups, {
		fields: [productSpecs.productGroupId],
		references: [productGroups.id]
	}),
	productFaqs: many(productFaqs),
}));

export const productsRelations = relations(products, ({one, many}) => ({
	productSpecs: many(productSpecs),
	productFaqs: many(productFaqs),
	subscriptions: many(subscriptions),
	productSetOptions_productId: many(productSetOptions, {
		relationName: "productSetOptions_productId_products_id"
	}),
	productSetOptions_optionProductId: many(productSetOptions, {
		relationName: "productSetOptions_optionProductId_products_id"
	}),
	leads: many(leads),
	subscriptionItems: many(subscriptionItems),
	user: one(users, {
		fields: [products.createdBy],
		references: [users.id]
	}),
	productGroup: one(productGroups, {
		fields: [products.productGroupId],
		references: [productGroups.id]
	}),
	product: one(products, {
		fields: [products.nextCycleProductId],
		references: [products.id],
		relationName: "products_nextCycleProductId_products_id"
	}),
	products: many(products, {
		relationName: "products_nextCycleProductId_products_id"
	}),
	orders_productId: many(orders, {
		relationName: "orders_productId_products_id"
	}),
	orders_addonProductId: many(orders, {
		relationName: "orders_addonProductId_products_id"
	}),
}));

export const productGroupsRelations = relations(productGroups, ({one, many}) => ({
	productSpecs: many(productSpecs),
	productFaqs: many(productFaqs),
	productFaqCategories: many(productFaqCategories),
	user: one(users, {
		fields: [productGroups.createdBy],
		references: [users.id]
	}),
	brand: one(brands, {
		fields: [productGroups.brandId],
		references: [brands.id]
	}),
	productGroupTaxRates: many(productGroupTaxRates),
	products: many(products),
}));

export const productFaqsRelations = relations(productFaqs, ({one}) => ({
	product: one(products, {
		fields: [productFaqs.productId],
		references: [products.id]
	}),
	productSpec: one(productSpecs, {
		fields: [productFaqs.generatedFromSpecId],
		references: [productSpecs.id]
	}),
	user: one(users, {
		fields: [productFaqs.reviewedBy],
		references: [users.id]
	}),
	productGroup: one(productGroups, {
		fields: [productFaqs.productGroupId],
		references: [productGroups.id]
	}),
	productFaqCategory: one(productFaqCategories, {
		fields: [productFaqs.categoryId],
		references: [productFaqCategories.id]
	}),
}));

export const productFaqCategoriesRelations = relations(productFaqCategories, ({one, many}) => ({
	productFaqs: many(productFaqs),
	productGroup: one(productGroups, {
		fields: [productFaqCategories.productGroupId],
		references: [productGroups.id]
	}),
}));

export const scenarioNodesRelations = relations(scenarioNodes, ({one, many}) => ({
	scenario: one(scenarios, {
		fields: [scenarioNodes.scenarioId],
		references: [scenarios.id]
	}),
	scenarioMenuItems: many(scenarioMenuItems),
}));

export const smaregiSyncLogsRelations = relations(smaregiSyncLogs, ({one}) => ({
	order: one(orders, {
		fields: [smaregiSyncLogs.orderId],
		references: [orders.id]
	}),
}));

export const ordersRelations = relations(orders, ({one, many}) => ({
	smaregiSyncLogs: many(smaregiSyncLogs),
	coreSystemSyncLogs: many(coreSystemSyncLogs),
	subscriptions: many(subscriptions),
	customer: one(customers, {
		fields: [orders.customerId],
		references: [customers.id]
	}),
	product_productId: one(products, {
		fields: [orders.productId],
		references: [products.id],
		relationName: "orders_productId_products_id"
	}),
	product_addonProductId: one(products, {
		fields: [orders.addonProductId],
		references: [products.id],
		relationName: "orders_addonProductId_products_id"
	}),
	scenario: one(scenarios, {
		fields: [orders.scenarioId],
		references: [scenarios.id]
	}),
	coupon: one(coupons, {
		fields: [orders.couponId],
		references: [coupons.id]
	}),
	order: one(orders, {
		fields: [orders.parentOrderId],
		references: [orders.id],
		relationName: "orders_parentOrderId_orders_id"
	}),
	orders: many(orders, {
		relationName: "orders_parentOrderId_orders_id"
	}),
	subscriptionItem: one(subscriptionItems, {
		fields: [orders.subscriptionItemId],
		references: [subscriptionItems.id]
	}),
}));

export const coreSystemSyncLogsRelations = relations(coreSystemSyncLogs, ({one}) => ({
	order: one(orders, {
		fields: [coreSystemSyncLogs.orderId],
		references: [orders.id]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one, many}) => ({
	order: one(orders, {
		fields: [subscriptions.orderId],
		references: [orders.id]
	}),
	product: one(products, {
		fields: [subscriptions.overrideProductId],
		references: [products.id]
	}),
	subscriptionItems: many(subscriptionItems),
	customerChangeLogs: many(customerChangeLogs),
	customerRetentionActions: many(customerRetentionActions),
}));

export const brandsRelations = relations(brands, ({many}) => ({
	productGroups: many(productGroups),
	bundleInsertItems: many(bundleInsertItems),
	retentionCampaignTypes: many(retentionCampaignTypes),
	bundleInsertSets: many(bundleInsertSets),
}));

export const productSetOptionsRelations = relations(productSetOptions, ({one}) => ({
	product_productId: one(products, {
		fields: [productSetOptions.productId],
		references: [products.id],
		relationName: "productSetOptions_productId_products_id"
	}),
	product_optionProductId: one(products, {
		fields: [productSetOptions.optionProductId],
		references: [products.id],
		relationName: "productSetOptions_optionProductId_products_id"
	}),
}));

export const customerViewLogsRelations = relations(customerViewLogs, ({one}) => ({
	customer: one(customers, {
		fields: [customerViewLogs.customerId],
		references: [customers.id]
	}),
	user: one(users, {
		fields: [customerViewLogs.viewedByUserId],
		references: [users.id]
	}),
}));

export const customersRelations = relations(customers, ({many}) => ({
	customerViewLogs: many(customerViewLogs),
	customerChangeLogs: many(customerChangeLogs),
	customerRetentionActions: many(customerRetentionActions),
	orders: many(orders),
}));

export const leadsRelations = relations(leads, ({one}) => ({
	product: one(products, {
		fields: [leads.productId],
		references: [products.id]
	}),
	scenario: one(scenarios, {
		fields: [leads.scenarioId],
		references: [scenarios.id]
	}),
}));

export const scenarioAccessLogsRelations = relations(scenarioAccessLogs, ({one}) => ({
	scenario: one(scenarios, {
		fields: [scenarioAccessLogs.scenarioId],
		references: [scenarios.id]
	}),
}));

export const subscriptionItemsRelations = relations(subscriptionItems, ({one, many}) => ({
	subscription: one(subscriptions, {
		fields: [subscriptionItems.subscriptionId],
		references: [subscriptions.id]
	}),
	product: one(products, {
		fields: [subscriptionItems.productId],
		references: [products.id]
	}),
	user: one(users, {
		fields: [subscriptionItems.createdBy],
		references: [users.id]
	}),
	orders: many(orders),
}));

export const scenarioMenuItemsRelations = relations(scenarioMenuItems, ({one}) => ({
	scenario: one(scenarios, {
		fields: [scenarioMenuItems.scenarioId],
		references: [scenarios.id]
	}),
	scenarioNode: one(scenarioNodes, {
		fields: [scenarioMenuItems.targetNodeId],
		references: [scenarioNodes.id]
	}),
}));

export const couponsRelations = relations(coupons, ({one, many}) => ({
	scenario: one(scenarios, {
		fields: [coupons.scenarioId],
		references: [scenarios.id]
	}),
	orders: many(orders),
}));

export const customerChangeLogsRelations = relations(customerChangeLogs, ({one}) => ({
	customer: one(customers, {
		fields: [customerChangeLogs.customerId],
		references: [customers.id]
	}),
	subscription: one(subscriptions, {
		fields: [customerChangeLogs.subscriptionId],
		references: [subscriptions.id]
	}),
}));

export const bundleInsertItemsRelations = relations(bundleInsertItems, ({one}) => ({
	brand: one(brands, {
		fields: [bundleInsertItems.brandId],
		references: [brands.id]
	}),
}));

export const retentionCampaignTypesRelations = relations(retentionCampaignTypes, ({one, many}) => ({
	brand: one(brands, {
		fields: [retentionCampaignTypes.brandId],
		references: [brands.id]
	}),
	customerRetentionActions: many(customerRetentionActions),
}));

export const customerRetentionActionsRelations = relations(customerRetentionActions, ({one}) => ({
	customer: one(customers, {
		fields: [customerRetentionActions.customerId],
		references: [customers.id]
	}),
	subscription: one(subscriptions, {
		fields: [customerRetentionActions.subscriptionId],
		references: [subscriptions.id]
	}),
	retentionCampaignType: one(retentionCampaignTypes, {
		fields: [customerRetentionActions.campaignTypeId],
		references: [retentionCampaignTypes.id]
	}),
	user: one(users, {
		fields: [customerRetentionActions.createdBy],
		references: [users.id]
	}),
}));

export const productGroupTaxRatesRelations = relations(productGroupTaxRates, ({one}) => ({
	productGroup: one(productGroups, {
		fields: [productGroupTaxRates.productGroupId],
		references: [productGroups.id]
	}),
	taxRate: one(taxRates, {
		fields: [productGroupTaxRates.taxRateId],
		references: [taxRates.id]
	}),
}));

export const taxRatesRelations = relations(taxRates, ({many}) => ({
	productGroupTaxRates: many(productGroupTaxRates),
}));

export const bundleInsertSetsRelations = relations(bundleInsertSets, ({one}) => ({
	brand: one(brands, {
		fields: [bundleInsertSets.brandId],
		references: [brands.id]
	}),
}));

export const checkoutFieldOrderRelations = relations(checkoutFieldOrder, ({one}) => ({
	scenario: one(scenarios, {
		fields: [checkoutFieldOrder.scenarioId],
		references: [scenarios.id]
	}),
}));