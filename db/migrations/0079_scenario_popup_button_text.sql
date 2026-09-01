-- ポップアップのアイコン画像を未設定にした場合に表示するテキストボタンの文言を、
-- シナリオ単位でカスタマイズできるようにする。未設定(null)の場合は
-- デフォルトの「チャットで相談する」のまま。
alter table scenarios add column if not exists popup_button_text text;
