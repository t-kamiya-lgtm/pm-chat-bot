-- 固定メニューのレイアウト選択(段数×コマ数)機能と、画像モード(1枚画像+クリック領域)機能。
-- menu_layout_key: src/lib/menu-layouts.ts のMENU_LAYOUTSのkeyのいずれか。未設定時は"row-3"(現行のデフォルト、1段×3列)。
-- menu_image_url: 設定されている場合、固定メニューはテキストボタンの代わりにこの画像+
-- (menu_layout_keyのマス目に対応する)クリック領域で表示する(テキストより画像を優先)。
alter table scenarios add column if not exists menu_layout_key text not null default 'row-3';
alter table scenarios add column if not exists menu_image_url text;
