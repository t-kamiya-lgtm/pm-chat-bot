-- 決済フォーム(1問1答形式)の質問表示順を管理画面から設定可能にする

create table if not exists checkout_field_order (
  field_key text primary key,
  display_order integer not null,
  updated_at timestamptz not null default now()
);


insert into checkout_field_order (field_key, display_order) values
  ('name', 0),
  ('email', 1),
  ('phone', 2),
  ('postalCode', 3),
  ('prefecture', 4),
  ('city', 5),
  ('line1', 6)
on conflict (field_key) do nothing;
