-- 「今すぐ買う」リッチメニュー項目の削除。
-- タイミング次第でシナリオの進行に影響してしまうため、全シナリオから削除する。
-- 実行前に対象を確認したい場合は、まず下記のSELECTでラベル文字列の一致を確認してください。

-- select id, scenario_id, label, action_type, target_node_id, url
-- from scenario_menu_items
-- where label like '%今すぐ買う%';

delete from scenario_menu_items
where label like '%今すぐ買う%';
