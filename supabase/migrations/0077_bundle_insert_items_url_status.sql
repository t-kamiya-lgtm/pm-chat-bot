-- 同梱物登録をギャラリー表示にするため、プレビュー用URL(Google Drive等)と
-- 有効/無効フラグを追加する。無効化した同梱物は新規セットの選択肢から外れる想定だが、
-- 過去のセットからの参照(配布実績)は残るため削除はできないままにする。
alter table bundle_insert_items
  add column if not exists url text,
  add column if not exists status text not null default 'active' check (status in ('active', 'inactive'));
create index if not exists idx_bundle_insert_items_status on bundle_insert_items (status);
