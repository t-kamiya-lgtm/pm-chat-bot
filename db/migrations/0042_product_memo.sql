-- セット品(福袋等)の内訳など、社内用のメモを品番に残せるようにする。
-- descriptionと異なりチャットボット画面には一切表示しない。
alter table products add column if not exists memo text;
