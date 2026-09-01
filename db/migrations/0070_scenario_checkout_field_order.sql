-- 決済フォームの質問表示順を、シナリオ単位で設定できるようにする(従来は全シナリオ共通の1設定だった)

alter table checkout_field_order drop constraint if exists checkout_field_order_pkey;
alter table checkout_field_order add column if not exists scenario_id uuid references scenarios(id) on delete cascade;

-- 既存の共通設定を、その時点で存在する全シナリオへの初期値として複製する
insert into checkout_field_order (scenario_id, field_key, display_order)
select s.id, cfo.field_key, cfo.display_order
from scenarios s
cross join checkout_field_order cfo
where cfo.scenario_id is null;

delete from checkout_field_order where scenario_id is null;

alter table checkout_field_order alter column scenario_id set not null;
alter table checkout_field_order add primary key (scenario_id, field_key);

create index if not exists checkout_field_order_scenario_id_idx on checkout_field_order (scenario_id);
