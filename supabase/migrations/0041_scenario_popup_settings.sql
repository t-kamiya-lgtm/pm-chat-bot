-- ポップアップ埋め込み(widget.js)で表示するボタンのアイコン画像・表示位置をシナリオ単位で設定できるようにする。
-- 未設定(null)の場合はテキストボタン・右下表示のデフォルト挙動のまま。
alter table scenarios add column if not exists popup_icon_url text;
alter table scenarios add column if not exists popup_position text
  check (popup_position is null or popup_position in ('bottom-right', 'bottom-left'));
