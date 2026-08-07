-- シナリオごとに埋め込む広告計測タグ(GA4/Google広告/Metaピクセル等のHTML/JSスニペット)を保持する。
alter table scenarios add column if not exists ad_tag text;
