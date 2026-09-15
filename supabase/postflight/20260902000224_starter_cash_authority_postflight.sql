do $$
declare
  v_default text;
begin
  if not exists(
    select 1 from supabase_migrations.schema_migrations
    where version='20260902000224'
  ) then
    raise exception '00224 is not registered';
  end if;
  select pg_get_expr(attribute.adbin,attribute.adrelid)
  into v_default
  from pg_attrdef attribute
  join pg_attribute column_definition
    on column_definition.attrelid=attribute.adrelid
   and column_definition.attnum=attribute.adnum
  where attribute.adrelid='public.users'::regclass
    and column_definition.attname='cash';
  if coalesce(regexp_replace(v_default,'[^0-9]','','g'),'')<>'2600' then
    raise exception 'fresh user CASH default is not 2600: %',v_default;
  end if;
end;
$$;
