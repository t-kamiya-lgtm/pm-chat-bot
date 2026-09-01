-- 問い合わせフォーム送信時、お客様へ自動返信する一次受けメールの件名・本文テンプレート。
alter table email_templates add column if not exists inquiry_auto_reply_subject text;
alter table email_templates add column if not exists inquiry_auto_reply_body text;
