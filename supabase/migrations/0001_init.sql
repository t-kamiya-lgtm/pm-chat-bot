-- チャットボット決済システム 初期スキーマ
-- docs/requirements.md 5. データモデル に対応

create extension if not exists "pgcrypto";

-- 管理画面ユーザー(Googleログイン、自社ドメイン限定)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null default 'unassigned' check (role in ('admin', 'staff', 'unassigned')),
  created_at timestamptz not null default now()
);

-- 商品マスタ
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price integer not null check (price >= 0),
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  image_url text,
  smaregi_product_id text,
  is_subscription_available boolean not null default false,
  subscription_intervals jsonb not null default '[]'::jsonb,
  stripe_product_id text,
  stripe_price_id text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 決済手段別の手数料(後払い/代引き)
create table if not exists payment_method_fees (
  id uuid primary key default gen_random_uuid(),
  payment_method text not null check (payment_method in ('cod', 'deferred_invoice')),
  order_type text check (order_type in ('one_time', 'subscription')), -- null = 単発/定期共通
  fee integer not null check (fee >= 0),
  created_at timestamptz not null default now(),
  unique (payment_method, order_type)
);

-- 初期値: 代金引換330円(単発・定期共通)、スコアあと払い 単発550円/定期220円
insert into payment_method_fees (payment_method, order_type, fee) values
  ('cod', null, 330),
  ('deferred_invoice', 'one_time', 550),
  ('deferred_invoice', 'subscription', 220)
on conflict (payment_method, order_type) do nothing;

-- 商品仕様情報(QA生成の元データ)
create table if not exists product_specs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  ingredients text,
  allergens text,
  volume text,
  usage text,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (product_id)
);

-- 商品QA
create table if not exists product_faqs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  question text not null,
  answer text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'rejected')),
  source text not null default 'generated' check (source in ('generated', 'manual')),
  generated_from_spec_id uuid references product_specs (id),
  reviewed_by uuid references users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- シナリオ
create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  version integer not null default 1,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- シナリオノード(選択肢分岐)
create table if not exists scenario_nodes (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios (id) on delete cascade,
  type text not null check (type in ('message', 'choice', 'product', 'checkout', 'product_qa')),
  content jsonb not null default '{}'::jsonb,
  next_node_map jsonb not null default '{}'::jsonb,
  is_entry boolean not null default false,
  created_at timestamptz not null default now()
);

-- 顧客
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  phone text,
  address jsonb,
  smaregi_member_id text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  unique (email)
);

-- 注文
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  product_id uuid not null references products (id),
  type text not null check (type in ('one_time', 'subscription')),
  payment_method text not null check (payment_method in ('stripe', 'deferred_invoice', 'cod')),
  amount integer not null check (amount >= 0),
  shipping_fee integer not null default 0,
  payment_fee integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'paid', 'failed', 'canceled')),
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 定期注文
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  interval text not null,
  next_billing_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- スマレジ連携送信ログ(モック)
create table if not exists smaregi_sync_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete cascade,
  payload jsonb not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text,
  created_at timestamptz not null default now()
);

-- 基幹システム連携送信ログ(モック、後払い・代引き用)
create table if not exists core_system_sync_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete cascade,
  payload jsonb not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_smaregi_product_id on products (smaregi_product_id);
create index if not exists idx_product_faqs_product_id_status on product_faqs (product_id, status);
create index if not exists idx_scenario_nodes_scenario_id on scenario_nodes (scenario_id);
create index if not exists idx_orders_customer_id on orders (customer_id);
create index if not exists idx_orders_stripe_payment_intent_id on orders (stripe_payment_intent_id);
create index if not exists idx_orders_stripe_subscription_id on orders (stripe_subscription_id);

-- updated_at 自動更新
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

drop trigger if exists trg_scenarios_updated_at on scenarios;
create trigger trg_scenarios_updated_at before update on scenarios
  for each row execute function set_updated_at();

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at before update on orders
  for each row execute function set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on subscriptions;
create trigger trg_subscriptions_updated_at before update on subscriptions
  for each row execute function set_updated_at();

-- Row Level Security: 管理系テーブルはサーバー(service role)経由のみで読み書きする方針のため、
-- クライアントからの直接アクセスは禁止し、すべてservice role/サーバーAPI経由に統一する。
alter table users enable row level security;
alter table products enable row level security;
alter table payment_method_fees enable row level security;
alter table product_specs enable row level security;
alter table product_faqs enable row level security;
alter table scenarios enable row level security;
alter table scenario_nodes enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table subscriptions enable row level security;
alter table smaregi_sync_logs enable row level security;
alter table core_system_sync_logs enable row level security;
-- ポリシーは意図的に定義しない(=service roleキーを使うサーバーサイドAPIのみアクセス可能)
