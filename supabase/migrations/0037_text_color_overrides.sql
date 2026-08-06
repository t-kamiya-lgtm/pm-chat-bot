-- 背景色に対するテキスト色(白/黒)を手動で上書きできるようにする。
-- null(未設定)の場合は背景色の濃淡から自動判定する。
alter table scenarios add column if not exists header_text_color text
  check (header_text_color is null or header_text_color in ('white', 'black'));
alter table scenarios add column if not exists message_text_color text
  check (message_text_color is null or message_text_color in ('white', 'black'));
alter table scenarios add column if not exists user_message_text_color text
  check (user_message_text_color is null or user_message_text_color in ('white', 'black'));
alter table scenarios add column if not exists menu_text_color text
  check (menu_text_color is null or menu_text_color in ('white', 'black'));
