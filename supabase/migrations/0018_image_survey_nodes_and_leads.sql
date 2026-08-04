-- 画像ノード/アンケートノードをscenario_nodes.typeに追加
alter table scenario_nodes drop constraint if exists scenario_nodes_type_check;
alter table scenario_nodes add constraint scenario_nodes_type_check
  check (type in ('message', 'choice', 'product', 'checkout', 'product_qa', 'image', 'survey'));

-- アンケート回答を注文データと一緒に保持する
alter table orders add column if not exists survey_responses jsonb;

-- 挨拶文・注文確認メッセージを最大5項目(画像+リンク or コメント)の配列に変更
alter table checkout_messages add column if not exists greeting_items jsonb not null default '[]'::jsonb;
alter table checkout_messages add column if not exists completion_items jsonb not null default '[]'::jsonb;
-- あいさつ文の直後に表示する、個人情報の利用に関する注意文
alter table checkout_messages add column if not exists privacy_notice text;

-- 入力途中で離脱した見込み客(名前・電話番号・メールアドレス・選択商品)を都度保存する
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  name text,
  phone text,
  email text,
  product_id uuid references products (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table leads enable row level security;
create index if not exists idx_leads_created_at on leads (created_at);
