-- お試し→本品自動切替プランで、2回目以降(本品)の頻度を指定できるようにする。
-- 1回目(お試し)は、お客様がチェックアウト時に選んだ頻度(subscription_intervalsのいずれか)
-- のまま1回だけ。2回目以降は、ここで指定した頻度に切り替わる。
alter table products add column if not exists next_cycle_interval text
  check (next_cycle_interval in ('biweekly', 'monthly', 'bimonthly'));
