-- アンケート回答を、注文完了前に離脱した見込み客の情報としても保持する。
alter table leads add column if not exists survey_responses jsonb;
