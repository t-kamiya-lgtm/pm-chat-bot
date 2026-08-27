-- 定期便申込データ編集(顧客管理画面)の基盤:
-- ・代引き・後払いの定期に対する商品/数量/2回目以降価格/送料/決済手数料/決済方法の個別上書き
-- ・定期プランへの商品追加(同一頻度で本体と同梱して生成し続ける)
-- ・顧客・定期便申込データの変更履歴

-- 上書きが設定されている場合、次回受注生成時にrootの初回注文のスナップショットより優先して使う。
-- 初回注文自体の記録(履歴・帳票)は書き換えない。初回価格は上書き対象外(変更不可の方針のため)。
alter table subscriptions add column if not exists override_product_id uuid references products (id);
alter table subscriptions add column if not exists override_quantity integer;
alter table subscriptions add column if not exists override_amount integer;
alter table subscriptions add column if not exists override_shipping_fee integer;
alter table subscriptions add column if not exists override_payment_fee integer;
alter table subscriptions add column if not exists override_payment_method text
  check (override_payment_method in ('cod', 'deferred_invoice'));

-- 定期プランに後から追加した商品。本体と同じ頻度・同じ配送日で生成し続ける「同梱」を表す。
create table if not exists subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  product_id uuid not null references products (id),
  quantity integer not null default 1,
  unit_amount integer not null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
alter table subscription_items enable row level security;
create index if not exists idx_subscription_items_subscription_id on subscription_items (subscription_id);

-- 同梱生成された注文行が、どのsubscription_item由来かを追跡する。
alter table orders add column if not exists subscription_item_id uuid references subscription_items (id);

-- 顧客・定期便申込データの変更履歴(氏名・メール・電話・住所・注文内容・解約・再開・スキップ操作等)。
-- 1回の保存操作 = 1行。変更されたフィールドのbefore/afterをchangesに配列で保存する。
create table if not exists customer_change_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,
  action text not null,
  changes jsonb not null default '[]'::jsonb,
  changed_by_email text not null,
  created_at timestamptz not null default now()
);
alter table customer_change_logs enable row level security;
create index if not exists idx_customer_change_logs_customer_id on customer_change_logs (customer_id);
