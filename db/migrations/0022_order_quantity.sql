-- 同一商品の複数点数購入に対応するため、注文ごとの数量を記録する。
alter table orders add column if not exists quantity integer not null default 1;
