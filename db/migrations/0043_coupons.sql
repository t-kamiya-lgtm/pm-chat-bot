-- クーポン機能。
-- type='scenario_auto': シナリオに紐づけ、決済時に自動適用(その場配布型)。
-- type='manual_code'  : お客様がコードを入力して適用(インフルエンサー計測用)。
-- 運用上、同一シナリオでは①②のいずれか一方のみを設定する想定のため、
-- システム側の併用制御(スタッキング)は持たない。万一両方成立した場合は
-- アプリ側で手入力コードを優先する。
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('scenario_auto', 'manual_code')),
  scenario_id uuid references scenarios(id) on delete cascade,
  code text,
  name text not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0,
  min_order_amount integer check (min_order_amount is null or min_order_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_scenario_auto_has_scenario check (
    (type = 'scenario_auto' and scenario_id is not null) or
    (type = 'manual_code' and scenario_id is null)
  ),
  constraint coupons_manual_code_has_code check (
    (type = 'manual_code' and code is not null) or
    (type = 'scenario_auto' and code is null)
  )
);


create unique index if not exists coupons_code_key on coupons (code) where code is not null;
create index if not exists coupons_scenario_id_idx on coupons (scenario_id) where scenario_id is not null;

-- 決済確認画面でのコード入力欄の表示要否をシナリオ単位で切り替える。
-- (シナリオ自動適用クーポンを使う場合、通常こちらはオフにする想定)
alter table scenarios add column if not exists coupon_code_field_enabled boolean not null default true;

-- 注文にクーポン適用結果を記録する。
alter table orders add column if not exists coupon_id uuid references coupons(id) on delete set null;
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists discount_amount integer not null default 0;

-- 同時アクセスでも上限枚数を正しく消費するよう、使用回数の加算をDB側の関数で行う。
create or replace function increment_coupon_usage(p_coupon_id uuid)
returns void
language sql
as $$
  update coupons set used_count = used_count + 1, updated_at = now() where id = p_coupon_id;
$$;
