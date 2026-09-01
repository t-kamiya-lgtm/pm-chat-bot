-- ブランド削除時に、紐づくアイテムのブランド設定を解除できるようにする(アイテム自体は削除しない)。
alter table product_groups drop constraint if exists product_groups_brand_id_fkey;
alter table product_groups
  add constraint product_groups_brand_id_fkey foreign key (brand_id) references brands (id) on delete set null;

-- セット品(構成数の分だけ品番を選ばせる商品)。
alter table products add column if not exists is_set boolean not null default false;
alter table products add column if not exists set_item_count integer check (set_item_count is null or set_item_count > 0);

create table if not exists product_set_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  option_product_id uuid not null references products(id) on delete cascade,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, option_product_id),
  constraint product_set_options_no_self_reference check (product_id <> option_product_id)
);


create index if not exists product_set_options_product_id_idx on product_set_options (product_id);

-- お客様がセット品の内訳として選んだ商品(id/nameのスナップショット)を注文に記録する。
alter table orders add column if not exists set_selections jsonb;
