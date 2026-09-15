-- Formal Open: authoritative material EXP, retained overflow, mixed atomic growth.
-- Existing level, ownership, inventories and awakening/limit-break values are preserved.
begin;

alter table public.user_characters add column if not exists xp bigint not null default 0 check (xp >= 0);
alter table public.user_equipments add column if not exists xp bigint not null default 0 check (xp >= 0);
alter table public.character_level_up_master add column if not exists required_exp integer;
insert into public.character_level_up_master(level,cost_cash,required_material_count,required_exp)
select lv,100,1,(array[100,200,350,500,700,1000,1400,1900,2500,3200])[((lv-1)/10)+1]
from generate_series(2,100) lv
on conflict(level) do update set cost_cash=excluded.cost_cash,required_exp=excluded.required_exp;
alter table public.character_level_up_master alter column required_exp set not null;
insert into public.equipment_level_up_master(level,cost_cash,required_exp)
select lv,50,(array[50,100,200,300,450,650,900,1250,1700,2250])[((lv-1)/10)+1]
from generate_series(2,100) lv
on conflict(level) do update set cost_cash=excluded.cost_cash,required_exp=excluded.required_exp;

create table public.growth_exp_execution_history (
 user_id uuid not null references public.users(id),
 request_id uuid not null,
 kind text not null check(kind in ('CHARACTER','EQUIPMENT')),
 owned_id uuid not null,
 materials jsonb not null,
 result_payload jsonb,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.growth_exp_execution_history enable row level security;
revoke all on public.growth_exp_execution_history from public,anon,authenticated;
grant select on public.growth_exp_execution_history to authenticated;
grant all on public.growth_exp_execution_history to service_role;
create policy growth_exp_history_owner_read on public.growth_exp_execution_history
 for select to authenticated using(user_id=auth.uid());

create or replace function public.get_growth_exp_master()
returns jsonb language sql stable security definer set search_path=public as $fn$
select jsonb_build_object(
 'version','2026-09-14',
 'character',(select jsonb_agg(jsonb_build_object('level',level,'required_exp',required_exp,'cost_cash',cost_cash) order by level) from public.character_level_up_master where level between 2 and 100),
 'equipment',(select jsonb_agg(jsonb_build_object('level',level,'required_exp',required_exp,'cost_cash',cost_cash) order by level) from public.equipment_level_up_master where level between 2 and 100),
 'items',(select jsonb_agg(jsonb_build_object('item_id',item_id,'effect_value',(runtime_usage->>'effectValue')::bigint) order by item_id) from public.canonical_item_master where version='2026-08-22' and is_production_enabled and item_id in ('CHAR_EXP_S','CHAR_EXP_M','CHAR_EXP_L','EQUIP_EXP_S','EQUIP_EXP_M','EQUIP_EXP_L'))
)
$fn$;

create or replace function public.quote_growth_exp(p_kind text,p_owned_id uuid,p_materials jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $fn$
declare
 u uuid:=auth.uid(); original_level integer; original_xp bigint; lv integer; exp bigint;
 cap integer; enhancement integer; req integer; cost_per_level integer; cash_cost bigint:=0;
 cash_balance bigint; gained bigint:=0; entry record; qty bigint; effect bigint; count_items bigint:=0;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('CHARACTER','EQUIPMENT') or p_owned_id is null
    or p_materials is null or jsonb_typeof(p_materials)<>'object' then
  raise exception 'invalid growth request' using errcode='22023';
 end if;
 if p_kind='CHARACTER' then
  select level,xp,awakening_level into lv,exp,enhancement from public.user_characters where id=p_owned_id and user_id=u;
  cap:=least(100,50+least(greatest(coalesce(enhancement,0),0),5)*10);
 else
  select level,xp,plus_val into lv,exp,enhancement from public.user_equipments where id=p_owned_id and user_id=u;
  cap:=public.canonical_equipment_level_cap(coalesce(enhancement,0));
 end if;
 if lv is null then raise exception 'owned growth target not found' using errcode='P0002'; end if;
 original_level:=lv; original_xp:=exp;
 for entry in select key,value from jsonb_each(p_materials) order by key loop
  if jsonb_typeof(entry.value)<>'number' or (entry.value::text)!~'^[0-9]+$' then
   raise exception 'material quantity must be a nonnegative integer' using errcode='22023';
  end if;
  qty:=(entry.value::text)::bigint;
  if (p_kind='CHARACTER' and entry.key not in ('CHAR_EXP_S','CHAR_EXP_M','CHAR_EXP_L'))
   or (p_kind='EQUIPMENT' and entry.key not in ('EQUIP_EXP_S','EQUIP_EXP_M','EQUIP_EXP_L')) then
   raise exception 'invalid growth material' using errcode='22023';
  end if;
  if qty>2147483647 then raise exception 'material quantity too large' using errcode='22023'; end if;
  select (runtime_usage->>'effectValue')::bigint into effect from public.canonical_item_master
   where version='2026-08-22' and item_id=entry.key and is_production_enabled;
  if effect is null or effect<=0 then raise exception 'growth item master incomplete' using errcode='P0002'; end if;
  gained:=gained+qty*effect; count_items:=count_items+qty;
 end loop;
 if lv>=100 then raise exception 'final level cap reached' using errcode='23514'; end if;
 exp:=exp+gained;
 while lv<cap loop
  if p_kind='CHARACTER' then
   select required_exp,cost_cash into req,cost_per_level from public.character_level_up_master where level=lv+1;
  else
   select required_exp,cost_cash into req,cost_per_level from public.equipment_level_up_master where level=lv+1;
  end if;
  if req is null or req<=0 or cost_per_level is null or cost_per_level<0 then
   raise exception 'growth level master incomplete' using errcode='P0002';
  end if;
  exit when exp<req;
  exp:=exp-req; lv:=lv+1; cash_cost:=cash_cost+cost_per_level;
 end loop;
 req:=null;
 if lv<100 then
  if p_kind='CHARACTER' then select required_exp into req from public.character_level_up_master where level=lv+1;
  else select required_exp into req from public.equipment_level_up_master where level=lv+1; end if;
  if req is null or req<=0 then raise exception 'growth level master incomplete' using errcode='P0002'; end if;
 end if;
 select cash into cash_balance from public.users where id=u;
 return jsonb_build_object('status','success','kind',p_kind,'owned_id',p_owned_id,
  'current_level',original_level,'current_xp',original_xp,
  'level',lv,'xp',exp,'level_cap',cap,'next_required_exp',req,
  'levels_gained',lv-original_level,'gained_exp',gained,'cash_spent',cash_cost,
  'remaining_cash',cash_balance-cash_cost,'consumed_materials',p_materials);
end
$fn$;

create or replace function public.execute_growth_exp(p_kind text,p_owned_id uuid,p_materials jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare
 u uuid:=auth.uid(); history public.growth_exp_execution_history%rowtype;
 result jsonb; entry record; qty bigint; owned_qty bigint; cash_balance bigint;
 normalized jsonb; inserted integer; gained_levels integer;
begin
 if u is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_request_id is null or p_kind is null or p_kind not in ('CHARACTER','EQUIPMENT')
  or p_owned_id is null or p_materials is null or jsonb_typeof(p_materials)<>'object' then
  raise exception 'invalid growth request' using errcode='22023';
 end if;
 -- Keep original request identity, including explicitly selected zero values.
 normalized:=p_materials;
 insert into public.growth_exp_execution_history(user_id,request_id,kind,owned_id,materials)
 values(u,p_request_id,p_kind,p_owned_id,normalized) on conflict(user_id,request_id) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then
  select * into history from public.growth_exp_execution_history where user_id=u and request_id=p_request_id for update;
  if history.kind<>p_kind or history.owned_id<>p_owned_id or history.materials<>normalized then
   raise exception 'request_id already used for a different growth request' using errcode='22023';
  end if;
  if history.result_payload is not null then return history.result_payload; end if;
  raise exception 'growth request already in progress' using errcode='55000';
 end if;
 -- Preserve owned-target -> cash -> inventory locking order of legacy growth.
 if p_kind='CHARACTER' then
  perform 1 from public.user_characters where id=p_owned_id and user_id=u for update;
 else
  perform 1 from public.user_equipments where id=p_owned_id and user_id=u for update;
 end if;
 if not found then raise exception 'owned growth target not found' using errcode='P0002'; end if;
 select cash into cash_balance from public.users where id=u for update;
 result:=public.quote_growth_exp(p_kind,p_owned_id,normalized);
 gained_levels:=(result->>'levels_gained')::integer;
 if (result->>'gained_exp')::bigint=0 and gained_levels=0 then
  raise exception 'no EXP or level increase to apply' using errcode='22023';
 end if;
 if cash_balance<(result->>'cash_spent')::bigint then
  raise exception 'insufficient cash' using errcode='23514';
 end if;
 for entry in select key,value from jsonb_each(normalized) order by key loop
  qty:=(entry.value::text)::bigint;
  if qty=0 then continue; end if;
  select quantity into owned_qty from public.user_items where user_id=u and item_id=entry.key for update;
  if coalesce(owned_qty,0)<qty then raise exception 'insufficient growth material' using errcode='23514'; end if;
 end loop;
 update public.users set cash=cash-(result->>'cash_spent')::bigint where id=u;
 for entry in select key,value from jsonb_each(normalized) order by key loop
  qty:=(entry.value::text)::bigint;
  if qty>0 then
   update public.user_items set quantity=quantity-qty,updated_at=now() where user_id=u and item_id=entry.key;
  end if;
 end loop;
 if p_kind='CHARACTER' then
  update public.user_characters set level=(result->>'level')::integer,xp=(result->>'xp')::bigint where id=p_owned_id and user_id=u;
 else
  update public.user_equipments set level=(result->>'level')::integer,xp=(result->>'xp')::bigint where id=p_owned_id and user_id=u;
 end if;
 if gained_levels>0 then
  perform public.evaluate_mission_progress(u,case when p_kind='CHARACTER' then 'CHAR_LEVEL_UP' else 'GEAR_UPGRADE' end,gained_levels);
 end if;
 result:=result||jsonb_build_object('request_id',p_request_id);
 update public.growth_exp_execution_history set result_payload=result where user_id=u and request_id=p_request_id;
 return result;
end
$fn$;

create or replace function public.level_up_character_exp(p_character_id uuid,p_materials jsonb,p_request_id uuid)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.execute_growth_exp('CHARACTER',p_character_id,p_materials,p_request_id)
$fn$;
create or replace function public.level_up_equipment_exp(p_equipment_id uuid,p_materials jsonb,p_request_id uuid)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.execute_growth_exp('EQUIPMENT',p_equipment_id,p_materials,p_request_id)
$fn$;
create or replace function public.level_up_character(p_character_id uuid,p_exp_item_id text,p_count integer default 1)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.level_up_character_exp(p_character_id,jsonb_build_object(p_exp_item_id,p_count),gen_random_uuid())
$fn$;
create or replace function public.level_up_equipment(p_equipment_id uuid,p_exp_item_id text,p_count integer default 1)
returns jsonb language sql security definer set search_path=public as $fn$
 select public.level_up_equipment_exp(p_equipment_id,jsonb_build_object(p_exp_item_id,p_count),gen_random_uuid())
$fn$;

revoke all on function public.execute_growth_exp(text,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.get_growth_exp_master(),public.quote_growth_exp(text,uuid,jsonb),
 public.level_up_character_exp(uuid,jsonb,uuid),public.level_up_equipment_exp(uuid,jsonb,uuid),
 public.level_up_character(uuid,text,integer),public.level_up_equipment(uuid,text,integer) from public,anon;
grant execute on function public.get_growth_exp_master(),public.quote_growth_exp(text,uuid,jsonb),
 public.level_up_character_exp(uuid,jsonb,uuid),public.level_up_equipment_exp(uuid,jsonb,uuid),
 public.level_up_character(uuid,text,integer),public.level_up_equipment(uuid,text,integer) to authenticated,service_role;

do $check$ begin
 if (select sum(required_exp) from public.character_level_up_master where level between 2 and 100)<>118400
 or (select sum(required_exp) from public.equipment_level_up_master where level between 2 and 100)<>78450 then
  raise exception 'growth EXP master checksum mismatch';
 end if;
end $check$;
notify pgrst,'reload schema';
commit;
