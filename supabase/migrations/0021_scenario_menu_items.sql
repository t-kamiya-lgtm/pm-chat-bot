-- シナリオごとに常時表示する固定メニュー(LINEリッチメニューのようなもの)のボタンを保持する。
-- ボタンは「特定ノードへ進む」か「外部URLを新しいタブで開く」のいずれかの動作を持つ。
create table if not exists scenario_menu_items (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  label text not null,
  action_type text not null check (action_type in ('node', 'url')),
  target_node_id uuid references scenario_nodes(id) on delete set null,
  url text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table scenario_menu_items enable row level security;

create index if not exists scenario_menu_items_scenario_id_idx on scenario_menu_items (scenario_id);
