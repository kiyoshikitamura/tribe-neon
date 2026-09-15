\set ON_ERROR_STOP on
begin;

do $$
declare v_default text;
begin
  select pg_get_expr(defaults.adbin,defaults.adrelid)
    into v_default
  from pg_attrdef defaults
  join pg_attribute attributes
    on attributes.attrelid=defaults.adrelid and attributes.attnum=defaults.adnum
  where defaults.adrelid='public.users'::regclass and attributes.attname='cash';
  if regexp_replace(coalesce(v_default,''),'[^0-9]','','g')<>'2600' then
    raise exception 'users.cash default is not 2600: %',v_default;
  end if;
end $$;

insert into public.users(id,username,cash,current_base_id)
values('26000000-0000-4000-8000-000000000001','TN06既存',7777,'shinjuku');

insert into public.users(id,username,current_base_id)
values('26000000-0000-4000-8000-000000000002','TN06新規','shinjuku');

do $$ begin
  if (select cash from public.users where id='26000000-0000-4000-8000-000000000001')<>7777 then
    raise exception 'existing balance was rewritten';
  end if;
  if (select cash from public.users where id='26000000-0000-4000-8000-000000000002')<>2600 then
    raise exception 'Fresh User did not receive CASH 2600';
  end if;
end $$;

insert into public.user_characters(id,user_id,character_id,level,awakening_level)
values('26000000-0000-4000-8000-000000000003','26000000-0000-4000-8000-000000000002','char_ageha_01',1,0);
insert into public.user_items(user_id,item_id,quantity)
values('26000000-0000-4000-8000-000000000002','CHAR_EXP_S',6);

set local role authenticated;
select set_config('request.jwt.claim.sub','26000000-0000-4000-8000-000000000002',true);
select public.level_up_character('26000000-0000-4000-8000-000000000003','CHAR_EXP_S',6);
reset role;

do $$ begin
  if (select cash from public.users where id='26000000-0000-4000-8000-000000000002')<>2000 then
    raise exception 'tutorial growth did not leave CASH 2000';
  end if;
  if (select level from public.user_characters where id='26000000-0000-4000-8000-000000000003')<>7 then
    raise exception 'tutorial growth did not reach Lv7';
  end if;
end $$;

rollback;
