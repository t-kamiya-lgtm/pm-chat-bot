-- クーポンノード機能。
-- シナリオの自動適用クーポン(type='scenario_auto')に、告知用の画像・訴求メッセージを追加する。
-- チャットフロー上の「クーポン表示」ノードは、このクーポンの内容をそのまま表示する
-- (ノード自体は表示位置の指定のみを持ち、内容は複製しない)。
alter table coupons add column if not exists image_url text;
alter table coupons add column if not exists promo_message text;

alter table scenario_nodes drop constraint if exists scenario_nodes_type_check;
alter table scenario_nodes add constraint scenario_nodes_type_check
  check (type in ('message', 'choice', 'product', 'checkout', 'product_qa', 'image', 'survey', 'video', 'coupon'));
