-- 増分利益(広告費除く)算出の土台。
-- 「原価・同梱物費用・送料原価・販売手数料」は税別入力で商品(品番)ごとに持たせ、
-- 税率は「税率メニュー×商品ジャンル(product_groups)×適用期間」で管理する
-- (商品ごとに税率・期間を設定するより手間が少ないため)。
-- 注文には、作成時点のこれらの値をスナップショットとして複製して保持する
-- (価格・手数料と同様、後からのマスタ変更が過去の実績を書き換えないようにするため)。

alter table products
  add column if not exists cost_amount integer not null default 0 check (cost_amount >= 0),
  add column if not exists bundle_insert_cost integer not null default 0 check (bundle_insert_cost >= 0),
  add column if not exists shipping_cost integer not null default 0 check (shipping_cost >= 0),
  add column if not exists sales_commission_amount integer not null default 0 check (sales_commission_amount >= 0);

comment on column products.cost_amount is '原価(税別、1点あたり)';
comment on column products.bundle_insert_cost is '同梱物費用(税別、1点あたりの一律設定額)';
comment on column products.shipping_cost is '送料原価(税別、顧客への請求送料shipping_feeとは別)';
comment on column products.sales_commission_amount is '販売手数料(税別、1点あたり)';

-- 税率メニュー(例: 標準税率10%、軽減税率8%)。
create table if not exists tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5, 4) not null check (rate >= 0),
  created_at timestamptz not null default now()
);

-- 商品ジャンル(product_groups)ごとの税率適用期間。同一ジャンルでも期間により異なる税率を設定できる。
create table if not exists product_group_tax_rates (
  id uuid primary key default gen_random_uuid(),
  product_group_id uuid not null references product_groups (id) on delete cascade,
  tax_rate_id uuid not null references tax_rates (id),
  period_start date not null,
  period_end date, -- null = 終了日未定(継続適用)
  created_at timestamptz not null default now()
);

create index if not exists idx_product_group_tax_rates_group_id on product_group_tax_rates (product_group_id);

-- 注文ごとの原価等スナップショット(注文作成時点の商品コスト設定・適用税率を固定して保持する)。
alter table orders
  add column if not exists cost_amount integer,
  add column if not exists bundle_insert_cost integer,
  add column if not exists shipping_cost integer,
  add column if not exists sales_commission_amount integer,
  add column if not exists tax_rate numeric(5, 4);

comment on column orders.cost_amount is '注文作成時点の商品原価スナップショット(税別、null=導入前の注文で未算出)';
comment on column orders.tax_rate is '注文作成時点の適用税率スナップショット(商品ジャンル×期間から解決、null=未設定)';
