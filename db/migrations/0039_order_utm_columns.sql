-- 注文がどの広告経由で発生したかを実績集計できるよう、注文発生時点のUTMパラメータを保持する。
alter table orders add column if not exists utm_source text;
alter table orders add column if not exists utm_medium text;
alter table orders add column if not exists utm_campaign text;
