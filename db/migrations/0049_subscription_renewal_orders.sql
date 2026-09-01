-- 定期購入(Stripe決済)の2回目以降、周期課金のたびにチャットシステム内へ
-- 新しい注文データを生成できるようにする。基幆システム・スマレジへは連携しない
-- (Stripe決済の注文はチャットシステム内の受注管理のみで完結させる運用のため)。

-- 何回目の請求分の注文かを示す(1=初回)。同一定期購入の注文をたどれるよう親注文も持たせる。
alter table orders add column if not exists parent_order_id uuid references orders (id);
alter table orders add column if not exists billing_cycle_number integer not null default 1;

-- 定期便(2回目以降)専用のメールテンプレート。
alter table email_templates add column if not exists renewal_subject text not null default '';
alter table email_templates add column if not exists renewal_body text not null default '';
