-- シナリオ(ブランド・商品)ごとに自動メールの送信元アドレスを設定可能にする。
-- 未設定の場合は共通の環境変数(ORDER_EMAIL_FROM)を使う。
alter table scenarios add column if not exists email_from_address text null;
