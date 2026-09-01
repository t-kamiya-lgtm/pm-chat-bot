-- 注文のキャンセルフラグ。決済ステータス(status: pending/accepted/paid/failed)とは独立して持つ
-- (例: 支払い完了後にキャンセルになるケースもあるため、statusを上書きせず別フラグで管理する)。
alter table orders add column if not exists canceled_at timestamptz null;
