-- メッセージ吹き出し(Bot側)の背景色をシナリオ単位でカスタマイズできるようにする。
alter table scenarios add column if not exists message_background_color text;

-- チャット画面上部のヘッダー(画像 or タイトル+背景色のいずれか)をシナリオ単位で設定できるようにする。
alter table scenarios add column if not exists header_mode text
  check (header_mode is null or header_mode in ('image', 'title'));
alter table scenarios add column if not exists header_image_url text;
alter table scenarios add column if not exists header_title text;
alter table scenarios add column if not exists header_background_color text;
