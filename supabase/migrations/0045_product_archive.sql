-- 注文で使用済みの品番は、外部キー制約により削除できない(注文履歴が壊れるため)。
-- 削除の代わりに「アーカイブ」して一覧から隠せるようにする。
alter table products add column if not exists is_active boolean not null default true;
