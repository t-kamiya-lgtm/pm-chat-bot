-- 定期購入の初回のみ適用する特別価格(任意)。2回目以降は通常価格(products.price)を使う。
alter table products add column if not exists first_time_price integer null;

-- Stripeの定期購入で、初回請求のみに適用した初回特別価格の値引き額(記録用、リニューアル注文にはコピーしない)。
alter table orders add column if not exists first_time_discount_amount integer null;
