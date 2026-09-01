-- メール種別ごとに、シナリオ(ブランド)単位で宛先・送信元アドレスを設定可能にする。
-- 個別に未設定の場合は、既存のscenarios.email_from_address(共通デフォルト)にフォールバックする。
alter table scenarios add column if not exists inquiry_receive_email text null;
alter table scenarios add column if not exists inquiry_auto_reply_from text null;
alter table scenarios add column if not exists order_confirmation_from text null;
alter table scenarios add column if not exists abandoned_reminder_from text null;
alter table scenarios add column if not exists cancellation_from text null;
alter table scenarios add column if not exists shipment_complete_from text null;
