-- 基幹システムへの取り込み(手動連携)が済んだ注文を管理するためのフラグ。
alter table orders add column if not exists imported boolean not null default false;
alter table orders add column if not exists imported_at timestamptz;
