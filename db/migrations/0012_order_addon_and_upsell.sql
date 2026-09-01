-- クロスセルで追加された1点(アドオン)の記録用。アップセルは既存のproduct_idを
-- 変更後の商品IDに置き換えるだけなので、追加カラムは不要。
alter table orders add column if not exists addon_product_id uuid references products (id);
alter table orders add column if not exists addon_amount integer;
