-- シナリオノードに動画表示("video")を追加する。
-- 直接URL(mp4等)のインライン再生・YouTube/Vimeo等の埋め込み再生の両方に対応する想定。
alter table scenario_nodes drop constraint if exists scenario_nodes_type_check;
alter table scenario_nodes add constraint scenario_nodes_type_check
  check (type in ('message', 'choice', 'product', 'checkout', 'product_qa', 'image', 'survey', 'video'));
