-- アクセスログ(leads)は分析用の記録であり、注文のような整合性を保つ必要はないため、
-- 参照している品番が削除されてもログ自体は残せるようにする。
alter table leads drop constraint if exists leads_product_id_fkey;
alter table leads
  add constraint leads_product_id_fkey foreign key (product_id) references products (id) on delete set null;
