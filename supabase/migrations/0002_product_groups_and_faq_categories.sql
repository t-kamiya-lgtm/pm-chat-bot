-- 商品種類(親品番)・QAカテゴリ対応
-- 要件変更: 単品/定期を別品番として登録し、商品QAは品番ではなく
-- 商品種類(親品番)単位・カテゴリ単位で管理する。

-- 商品種類(親品番)
create table if not exists product_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_code text,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table product_groups enable row level security;

drop trigger if exists trg_product_groups_updated_at on product_groups;
create trigger trg_product_groups_updated_at before update on product_groups
  for each row execute function set_updated_at();

-- products: 親品番への紐付け、単品/定期の別を明確化
alter table products add column if not exists product_group_id uuid references product_groups (id);
alter table products add column if not exists order_type text not null default 'one_time'
  check (order_type in ('one_time', 'subscription'));

-- is_subscription_available は order_type に統合するため廃止
alter table products drop column if exists is_subscription_available;

create index if not exists idx_products_product_group_id on products (product_group_id);

-- product_specs: 品番ではなく商品種類(親品番)単位の仕様情報に変更
alter table product_specs add column if not exists product_group_id uuid references product_groups (id);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_specs_product_group_id_key'
  ) then
    alter table product_specs add constraint product_specs_product_group_id_key unique (product_group_id);
  end if;
end $$;

-- 商品QAカテゴリ(商品種類ごとに任意設定)
create table if not exists product_faq_categories (
  id uuid primary key default gen_random_uuid(),
  product_group_id uuid not null references product_groups (id) on delete cascade,
  title text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table product_faq_categories enable row level security;
create index if not exists idx_product_faq_categories_group_id on product_faq_categories (product_group_id);

-- product_faqs: 品番ではなく商品種類(親品番)・カテゴリへの紐付けに変更
alter table product_faqs add column if not exists product_group_id uuid references product_groups (id);
alter table product_faqs add column if not exists category_id uuid references product_faq_categories (id);

create index if not exists idx_product_faqs_group_id_status on product_faqs (product_group_id, status);
create index if not exists idx_product_faqs_category_id on product_faqs (category_id);
