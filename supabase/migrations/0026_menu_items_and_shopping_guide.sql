-- 固定メニューのボタン種類に「営業日カレンダー表示」「お買い物ガイド表示」を追加する。
alter table scenario_menu_items drop constraint if exists scenario_menu_items_action_type_check;
alter table scenario_menu_items add constraint scenario_menu_items_action_type_check
  check (action_type in ('node', 'url', 'business_calendar', 'shopping_guide'));

-- お買い物ガイド(特定商取引法の表記のうち、案内として単独表示したい本文)。
alter table checkout_messages add column if not exists shopping_guide_text text;
