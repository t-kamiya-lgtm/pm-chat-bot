-- キャンセル確認メール・出荷完了メールの件名・本文テンプレート。
alter table email_templates add column if not exists cancellation_subject text;
alter table email_templates add column if not exists cancellation_body text;
alter table email_templates add column if not exists shipment_complete_subject text;
alter table email_templates add column if not exists shipment_complete_body text;
