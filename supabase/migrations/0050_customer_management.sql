-- 顧客管理機能: 注文完了者への連番顧客IDと、スマレジ連携状態、閲覧ログ。

create sequence if not exists customer_number_seq start 1;
alter table customers add column if not exists customer_number integer unique;

-- 代引き・後払いの定期購入がスマレジへ登録済みか(スマレジ連携の実装完了までは常にnull)。
alter table customers add column if not exists smaregi_synced_at timestamptz;

-- 注文完了時に一度だけ連番を振る(既に振られていればその値を返す)。
create or replace function assign_customer_number(p_customer_id uuid)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  select customer_number into v_number from customers where id = p_customer_id;
  if v_number is not null then
    return v_number;
  end if;
  v_number := nextval('customer_number_seq');
  update customers set customer_number = v_number where id = p_customer_id;
  return v_number;
end;
$$;

-- 個人情報を含む顧客詳細画面の閲覧ログ(誰が・いつ見たか)。
create table if not exists customer_view_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  viewed_by_user_id uuid references users (id),
  viewed_by_email text not null,
  created_at timestamptz not null default now()
);
alter table customer_view_logs enable row level security;
create index if not exists idx_customer_view_logs_customer_id on customer_view_logs (customer_id);
