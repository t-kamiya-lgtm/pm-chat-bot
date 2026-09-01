-- 二重価格表記(打消線で表示する比較価格)のラベルを商品ごとに選べるようにする。
-- 'list_price'(通常価格・従来のlist_price列を使う) / 'unit_total'(単品合計価格・手入力)
-- / 'custom'(その他・ラベル文言と金額を両方手入力) / 'none'(比較価格を表示しない)
alter table products add column if not exists compare_price_type text not null default 'none'
  check (compare_price_type in ('none', 'list_price', 'unit_total', 'custom'));
alter table products add column if not exists unit_total_price integer null;
alter table products add column if not exists custom_compare_label text null;
alter table products add column if not exists custom_compare_price integer null;

-- 既存商品はlist_priceが入っていれば従来通り「通常価格」表示を維持する。
update products set compare_price_type = 'list_price' where list_price is not null and compare_price_type = 'none';
