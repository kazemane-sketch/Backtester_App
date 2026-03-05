select
  routine_schema,
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'suggest_instruments';

select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args,
  p.proargnames as arg_names
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'suggest_instruments';
