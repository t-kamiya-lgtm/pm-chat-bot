-- ウィジェット(チャットボット)へのアクセスを記録し、実績ダッシュボードの
-- アクセス数・コンバージョン率・広告別内訳の算出に用いる。
create table if not exists scenario_access_logs (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid references scenarios(id) on delete set null,
  session_id text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  created_at timestamptz not null default now()
);

alter table scenario_access_logs enable row level security;

create index if not exists scenario_access_logs_scenario_id_idx on scenario_access_logs (scenario_id);
create index if not exists scenario_access_logs_created_at_idx on scenario_access_logs (created_at);
create unique index if not exists scenario_access_logs_session_id_key on scenario_access_logs (session_id);
