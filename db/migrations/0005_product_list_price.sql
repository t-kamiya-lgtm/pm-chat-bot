-- 二重価格表記(通常価格→特別価格)用。list_priceが未設定/price以下の場合は通常の単一価格表示のまま。
alter table products add column if not exists list_price integer;
alter table products add column if not exists price_label text;
