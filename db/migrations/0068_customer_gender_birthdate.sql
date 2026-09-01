-- 通販ゲート受注データ取込フォーマットの「注文者・性別」「注文者・誕生日」列向けに、
-- 決済フォームで収集する性別・生年月日を保持する。いずれも任意回答のためnull許容。
alter table customers add column if not exists gender text;
alter table customers add column if not exists birth_date date;
