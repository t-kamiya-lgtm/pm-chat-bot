-- 配送日計算で「営業日」から除外する日を管理者が追加登録できるようにする。
-- 祝日・土日は自動判定のため対象外(japanese-holidays.tsで計算)。
create table if not exists business_closed_dates (
  date date primary key,
  reason text,
  created_at timestamptz not null default now()
);

alter table business_closed_dates enable row level security;
