-- 希望お届け日・時間帯、注文確定時の特商法/個人情報取り扱い同意の記録用。
alter table orders add column if not exists delivery_date date;
alter table orders add column if not exists delivery_time_slot text;
alter table orders add column if not exists agreed_terms_at timestamptz;
