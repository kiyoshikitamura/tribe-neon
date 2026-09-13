-- 9/12承認済み正本。既存Normal/Tutorial・ユーザー残高・公開Flagを変更しない。
begin;

insert into public.gacha_masters(id,name,gacha_type,cost_cash,cost_diamond)
values ('CHAR_JUSTICE_EVIL_SPECIAL','正義／悪ガチャ','CHARACTER',0,300),
       ('CHAR_ORDER_CHAOS_SPECIAL','秩序／混沌ガチャ','CHARACTER',0,300)
on conflict(id) do update set name=excluded.name,cost_cash=0,cost_diamond=excluded.cost_diamond;
update public.gacha_masters set cost_cash=0,cost_diamond=200
where id in ('SKILL_SPECIAL','EQUIP_SPECIAL');

-- Legacy CHAR_SPECIAL remains solely as a Tutorial SSR source; never sell it.
insert into public.gacha_items_master(id,gacha_id,item_type,item_id,rarity,weight,is_pickup)
select group_id||':'||c.character_id,group_id,'CHARACTER',c.character_id,c.rarity,1,false
from public.canonical_character_master c
cross join (values ('CHAR_JUSTICE_EVIL_SPECIAL'),('CHAR_ORDER_CHAOS_SPECIAL')) g(group_id)
where c.version='2026-08-21' and c.rarity in ('R','SR','SSR')
  and ((group_id='CHAR_JUSTICE_EVIL_SPECIAL' and c.attribute in ('JUSTICE','EVIL'))
    or (group_id='CHAR_ORDER_CHAOS_SPECIAL' and c.attribute in ('ORDER','CHAOS')))
on conflict(id) do update set rarity=excluded.rarity,weight=1;

-- Dedicated item IDs mechanically matched to existing master; no new stats.
insert into public.gacha_items_master(id,gacha_id,item_type,item_id,rarity,weight,is_pickup)
select 'SKILL_SPECIAL:'||s.skill_id,'SKILL_SPECIAL','SKILL',s.skill_id,
  case when substring(s.skill_id from '[0-9]+$')::integer <=60 then 'SSR' else 'SR' end,1,false
from public.skill_battle_master s
where s.enabled and s.exclusive_character_id is not null
  and s.skill_id in (select 'SKILL_'||lpad(n::text,3,'0') from generate_series(51,70) n)
on conflict(id) do update set rarity=excluded.rarity,weight=1;
insert into public.gacha_items_master(id,gacha_id,item_type,item_id,rarity,weight,is_pickup)
select 'EQUIP_SPECIAL:'||e.equipment_id,'EQUIP_SPECIAL','EQUIPMENT',e.equipment_id,'SSR',1,false
from public.equipment_battle_master e where e.is_exclusive and e.rarity='SSR'
  and e.equipment_id in ('WEAPON_047','WEAPON_048','WEAPON_049','WEAPON_050','HEAD_020','BODY_029','BODY_030','LEGS_020','ACCESSORY_049','ACCESSORY_050')
on conflict(id) do update set rarity=excluded.rarity,weight=1;

delete from public.gacha_rarity_rates where gacha_id in
 ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL');
insert into public.gacha_rarity_rates(gacha_id,rarity,weight) values
 ('CHAR_JUSTICE_EVIL_SPECIAL','R',65),('CHAR_JUSTICE_EVIL_SPECIAL','SR',30),('CHAR_JUSTICE_EVIL_SPECIAL','SSR',5),
 ('CHAR_ORDER_CHAOS_SPECIAL','R',65),('CHAR_ORDER_CHAOS_SPECIAL','SR',30),('CHAR_ORDER_CHAOS_SPECIAL','SSR',5),
 ('SKILL_SPECIAL','R',57),('SKILL_SPECIAL','SR',35),('SKILL_SPECIAL','SSR',8),
 ('EQUIP_SPECIAL','R',52),('EQUIP_SPECIAL','SR',38),('EQUIP_SPECIAL','SSR',10);

create table public.special_gacha_pool_groups(
 gacha_id text not null references public.gacha_masters(id),
 rarity text not null check(rarity in ('R','SR','SSR')),
 is_exclusive boolean not null,
 weight integer not null check(weight>0),
 primary key(gacha_id,rarity,is_exclusive)
);
alter table public.special_gacha_pool_groups enable row level security;
revoke all on public.special_gacha_pool_groups from public,anon,authenticated;
grant select on public.special_gacha_pool_groups to authenticated;
grant all on public.special_gacha_pool_groups to service_role;
create policy special_gacha_pool_groups_read on public.special_gacha_pool_groups for select to authenticated using(true);
insert into public.special_gacha_pool_groups values
 ('CHAR_JUSTICE_EVIL_SPECIAL','R',false,65),('CHAR_JUSTICE_EVIL_SPECIAL','SR',false,30),('CHAR_JUSTICE_EVIL_SPECIAL','SSR',false,5),
 ('CHAR_ORDER_CHAOS_SPECIAL','R',false,65),('CHAR_ORDER_CHAOS_SPECIAL','SR',false,30),('CHAR_ORDER_CHAOS_SPECIAL','SSR',false,5),
 ('SKILL_SPECIAL','R',false,570),('SKILL_SPECIAL','SR',false,250),('SKILL_SPECIAL','SR',true,100),
 ('SKILL_SPECIAL','SSR',false,32),('SKILL_SPECIAL','SSR',true,48),
 ('EQUIP_SPECIAL','R',false,52),('EQUIP_SPECIAL','SR',false,38),
 ('EQUIP_SPECIAL','SSR',false,4),('EQUIP_SPECIAL','SSR',true,6);

create function public._special_gacha_is_exclusive(p_type text,p_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select case p_type when 'SKILL' then coalesce((select exclusive_character_id is not null from public.skill_battle_master where skill_id=p_id),false)
 when 'EQUIPMENT' then coalesce((select is_exclusive from public.equipment_battle_master where equipment_id=p_id),false) else false end
$$;
revoke all on function public._special_gacha_is_exclusive(text,text) from public,anon,authenticated;

-- Keep the existing item draw exactly for Normal and Tutorial's legacy pool.
alter function public.draw_gacha_item(text,text) rename to _draw_gacha_item_before_special_release;
revoke all on function public._draw_gacha_item_before_special_release(text,text) from public,anon,authenticated;
create function public.draw_gacha_item(p_gacha_id text,p_rarity text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare exclusive_group boolean; item text;
begin
 if p_gacha_id not in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL') then
  return public._draw_gacha_item_before_special_release(p_gacha_id,p_rarity);
 end if;
 select is_exclusive into exclusive_group from public.special_gacha_pool_groups
 where gacha_id=p_gacha_id and rarity=p_rarity
 order by -ln(greatest(random(),0.000000000001))/weight limit 1;
 if not found then raise exception 'SPECIAL_POOL_GROUP_MISSING'; end if;
 select item_id into item from public.gacha_items_master p
 where p.gacha_id=p_gacha_id and p.rarity=p_rarity
 and public._special_gacha_is_exclusive(p.item_type,p.item_id)=exclusive_group
 order by random() limit 1;
 if item is null then raise exception 'SPECIAL_POOL_EMPTY'; end if;
 return item;
end $$;
revoke all on function public.draw_gacha_item(text,text) from public,anon,authenticated;
grant execute on function public.draw_gacha_item(text,text) to service_role;

-- Guarded edits preserve all later patches on the actual five-argument RPCs.
do $$
declare definition text; updated text; signature text;
begin
 signature:='public.execute_character_gacha(uuid,text,integer,text,uuid)';
 definition:=pg_get_functiondef(signature::regprocedure);
 if position('v_is_special := p_gacha_id = ''CHAR_SPECIAL'';' in definition)=0
 or position('(''CHAR_NORMAL'', ''CHAR_SPECIAL'')' in definition)=0 then raise exception 'SPECIAL_CHARACTER_RPC_DRIFT'; end if;
 updated:=replace(definition,'v_is_special := p_gacha_id = ''CHAR_SPECIAL'';',
 'v_is_special := p_gacha_id in (''CHAR_JUSTICE_EVIL_SPECIAL'',''CHAR_ORDER_CHAOS_SPECIAL'');');
 updated:=replace(updated,'(''CHAR_NORMAL'', ''CHAR_SPECIAL'')','(''CHAR_NORMAL'',''CHAR_JUSTICE_EVIL_SPECIAL'',''CHAR_ORDER_CHAOS_SPECIAL'')');
 execute updated;
 foreach signature in array array['public.execute_character_gacha(uuid,text,integer,text,uuid)','public.execute_asset_gacha(uuid,text,integer,text,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('if v_is_special and not exists (' in definition)=0 then raise exception 'SPECIAL_RPC_GUARD_DRIFT: %',signature; end if;
  updated:=replace(definition,'if v_is_special and not exists (',
  'if v_is_special and (p_currency_type is null or p_currency_type not in (''diamonds'',''ticket'')) then
    raise exception ''SPECIAL_REQUIRES_DIA_OR_TICKET'';
  end if;
  if v_is_special and p_pull_count not in (1,10) then raise exception ''SPECIAL_INVALID_PULL_COUNT''; end if;
  if v_is_special and not exists (');
  if position('select coalesce(current_points, 0) into v_pity_before' in updated)=0 then raise exception 'SPECIAL_PITY_READ_DRIFT'; end if;
  updated:=replace(updated,'select coalesce(current_points, 0) into v_pity_before',
    'if v_is_special then perform 1 from public.users where id=p_user_id for update; end if;
  select coalesce(current_points, 0) into v_pity_before');
  execute updated;
 end loop;
end $$;

-- Pity exchange wrapper records request/result; underlying reward application stays canonical.
alter function public.exchange_pity_reward(uuid,text,text) rename to _exchange_pity_reward_before_special_release;
revoke all on function public._exchange_pity_reward_before_special_release(uuid,text,text) from public,anon,authenticated;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public._exchange_pity_reward_before_special_release(uuid,text,text)'::regprocedure);
 if position('v_points - 200' in definition)=0 or position('COALESCE(v_points, 0) < 200' in definition)=0 then raise exception 'SPECIAL_PITY_RPC_DRIFT'; end if;
 definition:=replace(replace(definition,'v_points - 200','v_points - 100'),'COALESCE(v_points, 0) < 200','COALESCE(v_points, 0) < 100');
 execute definition;
end $$;

create table public.special_gacha_exchange_receipts(
 user_id uuid not null references public.users(id) on delete cascade,
 request_id uuid not null,
 reward_type text not null check(reward_type in ('CHARACTER','SKILL','EQUIPMENT')),
 reward_id text not null,
 result_payload jsonb,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.special_gacha_exchange_receipts enable row level security;
revoke all on public.special_gacha_exchange_receipts from public,anon,authenticated;
grant select on public.special_gacha_exchange_receipts to authenticated;
grant all on public.special_gacha_exchange_receipts to service_role;
create policy special_exchange_receipts_owner on public.special_gacha_exchange_receipts for select to authenticated using((select auth.uid())=user_id);

create function public.exchange_special_gacha_reward(p_reward_type text,p_reward_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prior public.special_gacha_exchange_receipts%rowtype; result jsonb; points integer;
begin
 if u is null then raise exception 'not authorized'; end if;
 if p_request_id is null then raise exception 'request_id is required'; end if;
 perform 1 from public.users where id=u for update;
 select * into prior from public.special_gacha_exchange_receipts where user_id=u and request_id=p_request_id;
 if found then
  if prior.reward_type is distinct from p_reward_type or prior.reward_id is distinct from p_reward_id then raise exception 'request_id was already used for a different exchange'; end if;
  return prior.result_payload;
 end if;
 if not exists(select 1 from public.feature_operating_states where feature_key='SPECIAL_GACHA' and state='OPEN') then raise exception 'special gacha is closed'; end if;
 if not exists(select 1 from public.gacha_items_master where item_type=p_reward_type and item_id=p_reward_id and rarity='SSR'
 and gacha_id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')) then raise exception 'invalid pity reward'; end if;
 result:=public._exchange_pity_reward_before_special_release(u,p_reward_type,p_reward_id);
 select current_points into points from public.user_gacha_pity_points where user_id=u and pity_master_id='pity_special_common';
 result:=result||jsonb_build_object('current_points',points);
 insert into public.special_gacha_exchange_receipts(user_id,request_id,reward_type,reward_id,result_payload) values(u,p_request_id,p_reward_type,p_reward_id,result);
 return result;
end $$;
revoke all on function public.exchange_special_gacha_reward(text,text,uuid) from public,anon,authenticated;
grant execute on function public.exchange_special_gacha_reward(text,text,uuid) to authenticated;

-- One read returns operational availability and actual individual odds, not hardcoded UI rates.
create function public.get_special_gacha_catalog()
returns jsonb language sql stable security definer set search_path='' as $$
 with pool as (
  select p.gacha_id,p.item_type,p.item_id,p.rarity,
   public._special_gacha_is_exclusive(p.item_type,p.item_id) is_exclusive,
   coalesce(c.display_name,s.display_name,e.display_name,p.item_id) name
  from public.gacha_items_master p
  left join public.canonical_character_master c on p.item_type='CHARACTER' and c.character_id=p.item_id and c.version='2026-08-21'
  left join public.skill_battle_master s on p.item_type='SKILL' and s.skill_id=p.item_id
  left join public.equipment_battle_master e on p.item_type='EQUIPMENT' and e.equipment_id=p.item_id
  where p.gacha_id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')
 ), rates as (
  select p.*,100.0 * r.weight / (select sum(weight) from public.gacha_rarity_rates where gacha_id=p.gacha_id)
   * g.weight / (select sum(weight) from public.special_gacha_pool_groups where gacha_id=p.gacha_id and rarity=p.rarity)
   / count(*) over(partition by p.gacha_id,p.rarity,p.is_exclusive) probability
  from pool p join public.gacha_rarity_rates r using(gacha_id,rarity)
  join public.special_gacha_pool_groups g using(gacha_id,rarity,is_exclusive)
 ) select jsonb_build_object(
 'available',coalesce((select state='OPEN' from public.feature_operating_states where feature_key='SPECIAL_GACHA'),false),
 'pity_points',coalesce((select current_points from public.user_gacha_pity_points where user_id=auth.uid() and pity_master_id='pity_special_common'),0),
 'pity_cost',100,
 'gachas',(select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'cost_diamond',m.cost_diamond,
 'items',(select jsonb_agg(to_jsonb(r) order by r.rarity,r.item_id) from rates r where r.gacha_id=m.id)) order by m.id)
 from public.gacha_masters m where m.id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')))
$$;
revoke all on function public.get_special_gacha_catalog() from public,anon,authenticated;
grant execute on function public.get_special_gacha_catalog() to authenticated;

-- Fail before any mutation can persist if canonical dedicated pools are incomplete.
do $$
begin
 if (select count(*) from public.gacha_items_master where gacha_id='CHAR_JUSTICE_EVIL_SPECIAL' and rarity='SSR')<>4
 or (select count(*) from public.gacha_items_master where gacha_id='CHAR_ORDER_CHAOS_SPECIAL' and rarity='SSR')<>6 then raise exception 'SPECIAL_CHARACTER_ROSTER_MISMATCH'; end if;
 if (select count(*) from public.gacha_items_master p where p.gacha_id='SKILL_SPECIAL' and public._special_gacha_is_exclusive(p.item_type,p.item_id))<>20
 or (select count(*) from public.gacha_items_master p where p.gacha_id='EQUIP_SPECIAL' and public._special_gacha_is_exclusive(p.item_type,p.item_id))<>10 then raise exception 'SPECIAL_EXCLUSIVE_POOL_MISMATCH'; end if;
 if exists(select 1 from public.special_gacha_pool_groups g where not exists(select 1 from public.gacha_items_master p where p.gacha_id=g.gacha_id and p.rarity=g.rarity and public._special_gacha_is_exclusive(p.item_type,p.item_id)=g.is_exclusive)) then raise exception 'SPECIAL_POOL_EMPTY'; end if;
end $$;
commit;
