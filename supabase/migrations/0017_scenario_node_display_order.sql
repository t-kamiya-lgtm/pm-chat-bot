alter table scenario_nodes add column if not exists display_order integer;

with ordered as (
  select id, row_number() over (partition by scenario_id order by created_at asc) - 1 as rn
  from scenario_nodes
)
update scenario_nodes
set display_order = ordered.rn
from ordered
where scenario_nodes.id = ordered.id
  and scenario_nodes.display_order is null;

alter table scenario_nodes alter column display_order set default 0;
