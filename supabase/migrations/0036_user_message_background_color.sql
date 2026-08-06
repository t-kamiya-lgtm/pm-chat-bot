-- ユーザー(お客様)側のメッセージ吹き出しの背景色もシナリオ単位でカスタマイズできるようにする。
alter table scenarios add column if not exists user_message_background_color text;
