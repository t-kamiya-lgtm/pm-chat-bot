-- 通販ゲート受注データ取込フォーマットの「伝票記事」列向けに、決済フォームで収集する
-- 送り状への記載内容の指示(任意)を保持する。
alter table orders add column if not exists invoice_note text;
