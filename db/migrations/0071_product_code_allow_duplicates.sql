-- スマレジ連携の廃止に伴い、smaregi_product_id(商品コード)の一意制約を撤廃する。
-- 同じ商品コードで初回価格だけ異なる商品行を複数作成し、シナリオ/URLごとに
-- 出し分けてA/Bテストできるようにするため(重複防止は本来スマレジ連携の都合だった)。
drop index if exists products_smaregi_product_id_unique;
