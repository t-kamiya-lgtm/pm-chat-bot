-- 取り込みステータスを真偽値(imported)から3値(取込み済み/保留/未取込み)へ拡張する。
-- 前段のマイグレーション(imported/imported_at列の追加)を実行済みかどうかに関わらず安全に適用できるようにする。
alter table orders add column if not exists import_status text not null default 'not_imported'
  check (import_status in ('imported', 'on_hold', 'not_imported'));
alter table orders add column if not exists import_status_updated_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns where table_name = 'orders' and column_name = 'imported'
  ) then
    update orders set import_status = 'imported', import_status_updated_at = imported_at
      where imported = true;
    alter table orders drop column imported;
  end if;
  if exists (
    select 1 from information_schema.columns where table_name = 'orders' and column_name = 'imported_at'
  ) then
    alter table orders drop column imported_at;
  end if;
end $$;
