-- 注文完了メール・離脱者リマインドメールの自動送信(要件: 自動メール機能)。

-- 管理画面から編集できる、件名・本文テンプレート(全商品共通の1行のみ、checkout_messagesと同じ単一行パターン)。
create table if not exists email_templates (
  id smallint primary key default 1 check (id = 1),
  order_completion_subject text not null default '',
  order_completion_body text not null default '',
  abandoned_lead_subject text not null default '',
  abandoned_lead_body text not null default '',
  updated_at timestamptz not null default now()
);

insert into email_templates (id) values (1) on conflict (id) do nothing;

-- 注文完了メールの送信済みフラグ(Webhookの再送等で複数回処理されても一度だけ送るためのガード)。
alter table orders add column if not exists completion_email_sent_at timestamptz;

-- 離脱者リマインドメールの送信済みフラグ、および配信停止(オプトアウト)。
alter table leads add column if not exists abandoned_email_sent_at timestamptz;
alter table leads add column if not exists unsubscribed_at timestamptz;
