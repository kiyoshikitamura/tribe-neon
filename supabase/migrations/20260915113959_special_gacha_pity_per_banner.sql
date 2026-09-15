-- Preview applied version 20260915113959. One-time migration; never replay.
begin;
set local lock_timeout='5s';
lock table public.users in exclusive mode;
lock table public.user_gacha_pity_points, public.gacha_execution_history, public.special_gacha_exchange_receipts in exclusive mode;
do $$
begin
 if exists(select 1 from public.special_gacha_exchange_receipts) then raise exception 'Legacy exchanges require explicit allocation review'; end if;
 if exists(select 1 from public.user_gacha_pity_points p where p.pity_master_id='pity_special_common' and p.current_points <>
  coalesce((select sum(h.pity_after-h.pity_before) from public.gacha_execution_history h where h.user_id=p.user_id and h.status='COMPLETED'
   and h.gacha_id in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')),0)) then raise exception 'Legacy balance/history mismatch'; end if;
 if exists(select 1 from public.user_gacha_pity_points where pity_master_id like 'pity_banner:%') then raise exception 'Already migrated'; end if;
end $$;
insert into public.user_gacha_pity_points(user_id,pity_master_id,current_points)
select p.user_id,'pity_banner:'||g.id,coalesce(sum(h.pity_after-h.pity_before),0)
from public.user_gacha_pity_points p
cross join (values ('CHAR_JUSTICE_EVIL_SPECIAL'),('CHAR_ORDER_CHAOS_SPECIAL'),('SKILL_SPECIAL'),('EQUIP_SPECIAL')) g(id)
left join public.gacha_execution_history h on h.user_id=p.user_id and h.gacha_id=g.id and h.status='COMPLETED'
where p.pity_master_id='pity_special_common' group by p.user_id,g.id;
update public.user_gacha_pity_points set current_points=0,updated_at=now() where pity_master_id='pity_special_common';

-- Existing draw logic, locks, prices, pools and idempotent result replay are retained.
do $$
declare n text; d text;
begin
 foreach n in array array['execute_character_gacha','execute_asset_gacha'] loop
  d:=pg_get_functiondef(('public.'||n||'(uuid,text,integer,text,uuid,text)')::regprocedure);
  if position('''pity_special_common''' in d)=0 then raise exception 'Draw patch source mismatch'; end if;
  d:=replace(d,'''pity_special_common''','(case when v_is_special then ''pity_banner:''||p_gacha_id else ''pity_special_common'' end)');
  execute d;
 end loop;
 -- Clone the existing reward behavior, changing only its debit bucket.
 d:=pg_get_functiondef('public._exchange_pity_reward_before_special_release(uuid,text,text)'::regprocedure);
 d:=replace(d,'_exchange_pity_reward_before_special_release(p_user_id uuid, p_reward_type text, p_reward_id text)',
 '_exchange_pity_reward_per_banner(p_user_id uuid, p_reward_type text, p_reward_id text, p_gacha_id text)');
 if position('_exchange_pity_reward_per_banner' in d)=0 then raise exception 'Exchange patch source mismatch'; end if;
 d:=replace(d,'''pity_special_common''','(''pity_banner:''||p_gacha_id)');
 execute d;
end $$;
revoke all on function public._exchange_pity_reward_per_banner(uuid,text,text,text) from public,anon,authenticated;

alter table public.special_gacha_exchange_receipts add column gacha_id text references public.gacha_masters(id);
create function public.exchange_special_gacha_reward(p_gacha_id text,p_reward_type text,p_reward_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prior public.special_gacha_exchange_receipts; result jsonb; points integer;
begin
 if u is null then raise exception 'not authorized'; end if;
 if p_request_id is null then raise exception 'request_id is required'; end if;
 perform 1 from public.users where id=u for update;
 select * into prior from public.special_gacha_exchange_receipts where user_id=u and request_id=p_request_id;
 if found then
  if prior.gacha_id is distinct from p_gacha_id or prior.reward_type is distinct from p_reward_type or prior.reward_id is distinct from p_reward_id then raise exception 'request_id was already used for a different exchange'; end if;
  return prior.result_payload;
 end if;
 if not exists(select 1 from public.feature_operating_states where feature_key='SPECIAL_GACHA' and state='OPEN') then raise exception 'special gacha is closed'; end if;
 if p_gacha_id is null or p_gacha_id not in ('CHAR_JUSTICE_EVIL_SPECIAL','CHAR_ORDER_CHAOS_SPECIAL','SKILL_SPECIAL','EQUIP_SPECIAL')
  or not exists(select 1 from public.gacha_items_master where gacha_id=p_gacha_id and item_type=p_reward_type and item_id=p_reward_id and rarity='SSR') then raise exception 'invalid pity reward'; end if;
 result:=public._exchange_pity_reward_per_banner(u,p_reward_type,p_reward_id,p_gacha_id);
 select current_points into points from public.user_gacha_pity_points where user_id=u and pity_master_id='pity_banner:'||p_gacha_id;
 result:=result||jsonb_build_object('current_points',points,'gacha_id',p_gacha_id);
 insert into public.special_gacha_exchange_receipts(user_id,request_id,gacha_id,reward_type,reward_id,result_payload) values(u,p_request_id,p_gacha_id,p_reward_type,p_reward_id,result);
 return result;
end $$;
revoke all on function public.exchange_special_gacha_reward(text,text,text,uuid) from public,anon;
grant execute on function public.exchange_special_gacha_reward(text,text,text,uuid) to authenticated;
-- Old clients must reload, not spend shared points or choose a cross-banner reward.
create or replace function public.exchange_special_gacha_reward(p_reward_type text,p_reward_id text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin raise exception 'GACHA_RELOAD_REQUIRED'; end $$;

-- Preserve original read response for rolling clients; new UI uses explicit banner points.
create function public.get_special_gacha_catalog_v2()
returns jsonb language sql stable security definer set search_path='' as $$
 with original as (select public.get_special_gacha_catalog() value)
 select value || jsonb_build_object('pity_scope','PER_GACHA','gachas',
  (select jsonb_agg(g.value||jsonb_build_object('pity_points',
   coalesce((select current_points from public.user_gacha_pity_points where user_id=auth.uid() and pity_master_id='pity_banner:'||(g.value->>'id')),0))
   order by g.value->>'id') from jsonb_array_elements(value->'gachas') g)) from original
$$;
revoke all on function public.get_special_gacha_catalog_v2() from public,anon;
grant execute on function public.get_special_gacha_catalog_v2() to authenticated;
commit;
