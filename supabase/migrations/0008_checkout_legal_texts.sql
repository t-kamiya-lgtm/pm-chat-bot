-- 注文確認画面のスクロールボックスに表示する特定商取引法・個人情報の取り扱いの本文。
alter table checkout_messages add column if not exists terms_text text;
alter table checkout_messages add column if not exists privacy_text text;
