-- 0002で product_specs/product_faqs に product_group_id を追加したが、
-- 旧来の product_id カラムが not null のまま残っており、
-- 商品種類(親品番)単位での保存時にNOT NULL制約違反となっていたため修正する。
alter table product_specs alter column product_id drop not null;
alter table product_faqs alter column product_id drop not null;
