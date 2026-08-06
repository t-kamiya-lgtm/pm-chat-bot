-- 離脱リードに「このチャットセッションが注文に至ったか」を記録する。
-- 注文作成時にセッションIDで一度だけ確定させ、無関係な別の注文で遡って上書きされることはない。
alter table leads add column if not exists order_status text not null default 'abandoned'
  check (order_status in ('ordered', 'abandoned'));

-- フォローアップ対応(電話・メール・SMS)の実施状況を記録するチェックボックス。
alter table leads add column if not exists contacted_phone boolean not null default false;
alter table leads add column if not exists contacted_email boolean not null default false;
alter table leads add column if not exists contacted_sms boolean not null default false;

-- 注文がどのチャットセッション由来かを記録し、離脱リードとの紐付けに使う。
alter table orders add column if not exists session_id text;

-- 移行時点で既に注文が完了している顧客の履歴データを、新しい固定ステータスに反映しておく
-- (以後はこの一括更新を行わず、セッションIDでの一度きりの確定のみで管理する)。
update leads l
set order_status = 'ordered'
from customers c
join orders o on o.customer_id = c.id
where c.email = l.email
  and o.status in ('paid', 'accepted')
  and l.email is not null
  and l.order_status <> 'ordered';

-- 注文の取り込みステータスに「取込みエラー」「対象外」を追加する。
alter table orders drop constraint if exists orders_import_status_check;
alter table orders add constraint orders_import_status_check
  check (import_status in ('imported', 'on_hold', 'not_imported', 'import_error', 'excluded'));
