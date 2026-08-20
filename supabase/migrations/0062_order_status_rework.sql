-- 受注ステータス(import_status)の見直し。
-- ①キャンセルは独立フラグ(canceled_at)ではなく、受注ステータスの値の1つに統合する。
-- ②出荷済(shipped)を追加し、Stripe注文の送り状データ取込み時にこの値へ進める。
alter table orders drop constraint if exists orders_import_status_check;
alter table orders add constraint orders_import_status_check
  check (import_status in ('imported', 'on_hold', 'not_imported', 'import_error', 'excluded', 'shipped', 'canceled'));

-- 既存のcanceled_atフラグが立っている注文を、受注ステータス側に移行する。
update orders
set import_status = 'canceled',
    import_status_updated_at = coalesce(import_status_updated_at, canceled_at)
where canceled_at is not null;

alter table orders drop column if exists canceled_at;

-- Stripe注文の送り状データ(出荷日・運送会社名・送り状番号)。CSV取込みで設定する。
-- 代引き・後払いはスマレジ側で完結するため対象外(常にnullのまま)。
alter table orders add column if not exists shipped_at timestamptz null;
alter table orders add column if not exists carrier_name text null;
alter table orders add column if not exists tracking_number text null;

-- キャンセル確認メール・出荷完了メールの二重送信防止用ガード。
alter table orders add column if not exists cancellation_email_sent_at timestamptz null;
alter table orders add column if not exists shipment_email_sent_at timestamptz null;
