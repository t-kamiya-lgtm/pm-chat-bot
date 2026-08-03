-- 商品種類(親品番)の一段上の階層。「プロテインモンスター」ブランドの下に
-- 「プロテインモンスター(通常)」「プロテインモンスターソバ」等の商品種類がぶら下がる想定。
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table brands enable row level security;

alter table product_groups add column if not exists brand_id uuid references brands (id);
