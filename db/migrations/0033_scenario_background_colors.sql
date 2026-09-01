-- シナリオごとに、リッチメニューの背景色とチャット画面全体の背景色をカスタマイズできるようにする。
-- 未設定(null)の場合は既存のデフォルト配色(白・薄い黄色)を使う。
alter table scenarios add column if not exists chat_background_color text;
alter table scenarios add column if not exists menu_background_color text;
