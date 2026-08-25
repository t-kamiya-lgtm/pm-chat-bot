-- 通販ゲート受注データ取込フォーマットの「注文者・ｶﾅ氏名」列(必須)に対応するため、
-- 顧客のフリガナ(半角カナ)を保持する。決済フォームで新規に必須収集する。
alter table customers add column if not exists name_kana text;
