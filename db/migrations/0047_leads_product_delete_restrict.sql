-- 0046でON DELETE SET NULLに変更したが、閲覧履歴が残っている品番の削除は
-- (分かりやすいエラーメッセージで)引き続き制御したいとの要望のため、削除禁止に戻す。
-- アプリ側(DELETE /api/products/[id])で、削除前にleadsの参照件数を確認し、
-- 残っている場合は分かりやすいエラーを返すようにしている。
alter table leads drop constraint if exists leads_product_id_fkey;
alter table leads
  add constraint leads_product_id_fkey foreign key (product_id) references products (id);
