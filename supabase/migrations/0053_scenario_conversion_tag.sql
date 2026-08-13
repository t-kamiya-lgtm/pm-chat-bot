-- 購入完了時に発火させるコンバージョン計測タグ(Google広告のコンバージョンタグ、Metaの購入イベント等)。
-- 広告計測タグ(ad_tag)はチャット表示時に一度だけ発火するのに対し、こちらは注文完了時にのみ発火する。
alter table scenarios add column if not exists conversion_tag text;
