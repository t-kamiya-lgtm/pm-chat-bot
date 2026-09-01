-- アクセスログ(leads)の重複統合。
-- 対応フラグ(電話・メール・SMS)が一つも立っていないレコードのみを対象に、
-- 電話番号(電話番号が無い場合はメールアドレス)が一致するものを1件にまとめる。
-- 各項目は最新の更新日時のログを優先しつつ、値が空の項目だけ古いログから補完する
-- (=データ量が最も多くなるように、あたらしいログを軸に更新・保存する)。
-- アンケート回答は全ログ分をマージし、キーが重複する場合は新しいログの回答を優先する。
-- 一度も対応していない重複のみが対象のため、スタッフが対応済みのログが誤って書き換わることはない。
-- 統合後に残った側のレコードのみ更新し、他のレコードは削除するため、再実行しても重複が無ければ何も起きない。

do $$
declare
  grp record;
  rec record;
  winner_id uuid;
  merged_name text;
  merged_phone text;
  merged_email text;
  merged_product_id uuid;
  merged_survey jsonb;
  merged_order_status text;
  merged_created_at timestamptz;
  merged_updated_at timestamptz;
begin
  -- 電話番号が一致するもの同士をまとめる
  for grp in
    select phone as key
    from leads
    where phone is not null and phone <> ''
      and not contacted_phone and not contacted_email and not contacted_sms
    group by phone
    having count(*) > 1
  loop
    merged_name := null; merged_phone := null; merged_email := null; merged_product_id := null;
    merged_survey := '{}'::jsonb;
    merged_order_status := 'abandoned';
    merged_created_at := null; merged_updated_at := null; winner_id := null;

    for rec in
      select * from leads
      where phone = grp.key
        and not contacted_phone and not contacted_email and not contacted_sms
      order by updated_at asc
    loop
      if rec.name is not null then merged_name := rec.name; end if;
      if rec.phone is not null then merged_phone := rec.phone; end if;
      if rec.email is not null then merged_email := rec.email; end if;
      if rec.product_id is not null then merged_product_id := rec.product_id; end if;
      merged_survey := merged_survey || coalesce(rec.survey_responses, '{}'::jsonb);
      if rec.order_status = 'ordered' then merged_order_status := 'ordered'; end if;
      if merged_created_at is null or rec.created_at < merged_created_at then
        merged_created_at := rec.created_at;
      end if;
      if merged_updated_at is null or rec.updated_at > merged_updated_at then
        merged_updated_at := rec.updated_at;
        winner_id := rec.id;
      end if;
    end loop;

    update leads set
      name = merged_name,
      phone = merged_phone,
      email = merged_email,
      product_id = merged_product_id,
      survey_responses = merged_survey,
      order_status = merged_order_status,
      created_at = merged_created_at,
      updated_at = merged_updated_at
    where id = winner_id;

    delete from leads
    where phone = grp.key
      and not contacted_phone and not contacted_email and not contacted_sms
      and id <> winner_id;
  end loop;

  -- 電話番号が無く、メールアドレスのみで一致するもの同士をまとめる
  for grp in
    select email as key
    from leads
    where (phone is null or phone = '')
      and email is not null and email <> ''
      and not contacted_phone and not contacted_email and not contacted_sms
    group by email
    having count(*) > 1
  loop
    merged_name := null; merged_phone := null; merged_email := null; merged_product_id := null;
    merged_survey := '{}'::jsonb;
    merged_order_status := 'abandoned';
    merged_created_at := null; merged_updated_at := null; winner_id := null;

    for rec in
      select * from leads
      where email = grp.key
        and (phone is null or phone = '')
        and not contacted_phone and not contacted_email and not contacted_sms
      order by updated_at asc
    loop
      if rec.name is not null then merged_name := rec.name; end if;
      if rec.phone is not null then merged_phone := rec.phone; end if;
      if rec.email is not null then merged_email := rec.email; end if;
      if rec.product_id is not null then merged_product_id := rec.product_id; end if;
      merged_survey := merged_survey || coalesce(rec.survey_responses, '{}'::jsonb);
      if rec.order_status = 'ordered' then merged_order_status := 'ordered'; end if;
      if merged_created_at is null or rec.created_at < merged_created_at then
        merged_created_at := rec.created_at;
      end if;
      if merged_updated_at is null or rec.updated_at > merged_updated_at then
        merged_updated_at := rec.updated_at;
        winner_id := rec.id;
      end if;
    end loop;

    update leads set
      name = merged_name,
      phone = merged_phone,
      email = merged_email,
      product_id = merged_product_id,
      survey_responses = merged_survey,
      order_status = merged_order_status,
      created_at = merged_created_at,
      updated_at = merged_updated_at
    where id = winner_id;

    delete from leads
    where email = grp.key
      and (phone is null or phone = '')
      and not contacted_phone and not contacted_email and not contacted_sms
      and id <> winner_id;
  end loop;
end $$;
