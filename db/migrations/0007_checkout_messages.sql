-- 決済フォームのあいさつ文・注文確認メッセージ(全商品共通のテンプレート、1行のみ)。
create table if not exists checkout_messages (
  id smallint primary key default 1 check (id = 1),
  greeting text,
  completion_message text,
  updated_at timestamptz not null default now()
);

insert into checkout_messages (id) values (1) on conflict (id) do nothing;
