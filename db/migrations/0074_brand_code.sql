-- ダッシュボードのブランド別集計のため、ブランドに2文字コードを追加する。
-- シナリオの「識別コード」(scenarios.order_code、受注番号のプレフィックス)を
-- 「英字2文字(ブランドコード)+数字4桁(シナリオNo)」形式の「シナリオコード」として
-- 運用し、先頭2文字をbrands.codeと突き合わせてブランドを判定する(新しい列は追加しない)。
alter table brands add column if not exists code text;
create unique index if not exists brands_code_unique on brands (code) where code is not null;
