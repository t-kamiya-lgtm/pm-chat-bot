-- お試し→自動で本品に切り替わる定期プランのための設定。
-- この品番で定期購入が開始された場合、2回目以降の注文・課金は
-- ここで指定した「本品」の品番・価格に自動的に切り替わる
-- (初回特別価格とは異なり、品番自体が変わるケース用)。
alter table products add column if not exists next_cycle_product_id uuid references products (id);
