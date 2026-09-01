-- 管理用メモ(チャットボット画面には表示されない)。ウィジェット向けAPIでは選択しない。
alter table scenario_nodes add column if not exists memo text;
