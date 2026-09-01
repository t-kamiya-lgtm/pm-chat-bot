-- 同梱物設定の運用を「①同梱物登録(個々の同梱物マスタ)→②同梱物設定(セットとして選択)」の
-- 2段構成に変更する。あわせて、同梱物設定に下書き状態を持たせ、対象条件が重複する
-- アクティブな設定がある場合は確認の上で下書き保存できるようにする。

-- ①同梱物登録: ブランドごとの個々の同梱物マスタ(例: レシピ01、挨拶文01定期)。
create table if not exists bundle_insert_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  item_type text not null, -- 同梱物種類(例: レシピブック、挨拶文、継続応援、ブランドブック、定期引き上げ)
  name text not null, -- 同梱物名(例: レシピ01)
  registered_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_bundle_insert_items_brand_id on bundle_insert_items (brand_id);

-- ②同梱物設定: 上記の同梱物を複数選んでセット化する。
-- status: 'active'(有効) / 'draft'(下書き。対象条件が重複する既存のactiveな設定があった場合に選べる)
-- item_ids: 紐づける同梱物(bundle_insert_items)のID配列。可変個数。
-- period_endは終了日未定(継続中)を表現できるようnullを許容する。
-- insert_labelはセット管理名(name)と別に表示ラベルを持ちたい場合の任意項目のため必須を外す。
alter table bundle_insert_sets
  add column if not exists status text not null default 'active' check (status in ('active', 'draft')),
  add column if not exists item_ids uuid[];
alter table bundle_insert_sets alter column period_end drop not null;
alter table bundle_insert_sets alter column insert_label drop not null;
create index if not exists idx_bundle_insert_sets_status on bundle_insert_sets (status);
