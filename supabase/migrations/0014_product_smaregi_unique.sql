-- スマレジ品番が設定されている場合のみ、重複登録を防ぐ(NULL同士は対象外)。
create unique index if not exists products_smaregi_product_id_unique
  on products (smaregi_product_id)
  where smaregi_product_id is not null;
