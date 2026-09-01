-- スマレジ受注連携の消費税計算用。商品ごとに軽減税率(8)/標準税率(10)が異なるため。
alter table products add column if not exists tax_rate smallint not null default 8 check (tax_rate in (8, 10));
