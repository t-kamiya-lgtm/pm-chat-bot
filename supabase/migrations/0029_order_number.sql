-- シナリオごとに注文番号の接頭コードを設定できるようにする。
alter table scenarios add column if not exists order_code text;

-- 注文がどのシナリオ経由かを記録し、人が読みやすい注文番号(接頭コード+日付8桁+時間2桁+連番3桁)を持たせる。
alter table orders add column if not exists scenario_id uuid references scenarios(id) on delete set null;
alter table orders add column if not exists order_number text;
