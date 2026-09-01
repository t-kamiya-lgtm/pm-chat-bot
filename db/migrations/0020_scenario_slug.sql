-- シナリオごとに固有の公開URL(/widget/<slug>)を割り当てられるようにする。
-- 既存の埋め込み(パラメータなしの /widget)は slug が未設定でも従来どおり動作する。
alter table scenarios add column if not exists slug text;
create unique index if not exists scenarios_slug_key on scenarios (slug) where slug is not null;
