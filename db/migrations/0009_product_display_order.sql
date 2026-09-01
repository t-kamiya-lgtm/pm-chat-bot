-- 商品(品番)一覧の並び替え用。既存行は登録日時が古い順に0,1,2...を割り当てる。
alter table products add column if not exists display_order integer;

update products set display_order = sub.rn
from (
  select id, row_number() over (order by created_at asc) - 1 as rn
  from products
) sub
where products.id = sub.id and products.display_order is null;

alter table products alter column display_order set default 0;
alter table products alter column display_order set not null;
