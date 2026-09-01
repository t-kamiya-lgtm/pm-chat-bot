-- ポスト投函(メール便)対象の商品を示すフラグ。対象商品は基本的にお届け日・時間帯の指定を受け付けない。
alter table products add column if not exists is_mail_deliverable boolean not null default false;
