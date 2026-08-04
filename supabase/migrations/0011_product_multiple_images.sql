-- 商品(品番)の複数画像対応。カルーセルでは先頭画像、商品詳細ではスワイプ表示に使う。
alter table products add column if not exists image_urls text[] not null default '{}';

update products
set image_urls = array[image_url]
where image_url is not null and image_urls = '{}';
