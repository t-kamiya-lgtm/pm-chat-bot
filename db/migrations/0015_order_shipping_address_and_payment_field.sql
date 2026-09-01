-- 注文者と別の届け先を指定した場合のみ入る(通常はnull=注文者住所と同じ)。
alter table orders add column if not exists shipping_address jsonb;
