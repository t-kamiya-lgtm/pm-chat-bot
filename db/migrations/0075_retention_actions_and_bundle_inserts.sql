-- 定期分析(実績)の基盤: 継続施策ログ・同梱物設定。
-- どちらもブランド単位でマスタを持ち、実績ダッシュボードでセグメント軸として使う。

-- ブランドごとの継続施策タイトルのマスタ(顧客管理画面ではここから選択する。自由入力にすると
-- 表記ゆれで集計軸が割れるため、あらかじめ登録した候補から選ぶ運用にする)。
create table if not exists retention_campaign_types (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_retention_campaign_types_brand_id on retention_campaign_types (brand_id);

-- 顧客ごとの継続施策実施ログ(例: 3回目に特典を送った、架電アンケートを実施した等)。
-- 集計軸は年月(実施月)×施策タイトル。
create table if not exists customer_retention_actions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,
  campaign_type_id uuid not null references retention_campaign_types (id),
  performed_month date not null, -- 実施年月(日は1日固定で保存し、年月単位の集計に使う)
  detail text,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_retention_actions_customer_id on customer_retention_actions (customer_id);
create index if not exists idx_customer_retention_actions_campaign_type_id on customer_retention_actions (campaign_type_id);

-- ブランドごとの同梱物セット。期間・対象条件(商品/回数/単品or定期)を持ち、
-- 定期分析でセグメント軸(この期間・条件に合致する注文にはこの同梱物セットが適用された、とみなす)として使う。
-- 個々の同梱物(A/B/C等)の内訳は問わず、セット単位で効果を測定する運用のため、
-- セット名(insert_label、例:「ABCセット」)のみを持つ。
create table if not exists bundle_insert_sets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  name text not null,
  insert_label text not null,
  period_start date not null,
  period_end date not null,
  -- 'subscription' | 'one_time' | 'both'
  target_order_type text not null default 'both' check (target_order_type in ('subscription', 'one_time', 'both')),
  -- 対象の回数(billing_cycle_number)。空/nullは全回数が対象(単品には適用しない意味合いにもなる)。
  target_cycle_numbers integer[],
  -- 対象商品。空/nullは全商品が対象。
  target_product_ids uuid[],
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bundle_insert_sets_brand_id on bundle_insert_sets (brand_id);

drop trigger if exists trg_bundle_insert_sets_updated_at on bundle_insert_sets;
create trigger trg_bundle_insert_sets_updated_at before update on bundle_insert_sets
  for each row execute function set_updated_at();
