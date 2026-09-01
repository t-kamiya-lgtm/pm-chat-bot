-- クロスセル(アドオン)商品自体も定期購入商品で、かつメインの定期便と同じ周期の場合、
-- 単発の追加購入ではなく、メインと同じ周期のもう1つの定期購入として同時注文できるようにする。
-- 注文作成時点の状態を記録し、Stripeの定期更新(subscription-renewal.ts)やスマレジ連携が
-- 都度アドオン商品の現在の設定を見に行かなくても済むようにする。
alter table orders add column if not exists is_addon_subscription boolean not null default false;
