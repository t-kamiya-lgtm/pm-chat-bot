alter table scenarios add column if not exists display_order integer;

with ordered as (
  select id, row_number() over (order by created_at asc) - 1 as rn
  from scenarios
)
update scenarios
set display_order = ordered.rn
from ordered
where scenarios.id = ordered.id
  and scenarios.display_order is null;

alter table scenarios alter column display_order set default 0;
