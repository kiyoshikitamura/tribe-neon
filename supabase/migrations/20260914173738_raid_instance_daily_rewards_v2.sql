-- Approved 2026-09-14. Preview candidate; advanced/expert contribution remains deliberately unconfigured.
begin;
create table public.raid_daily_clear_bonus_rules (
 difficulty text primary key references public.raid_room_clear_reward_rules(difficulty),
 chance_bp integer not null check(chance_bp between 0 and 10000),
 items jsonb not null check(jsonb_typeof(items)='array')
);
insert into public.raid_daily_clear_bonus_rules values
 ('beginner',3000,'[{"itemId":"NORMAL_GACHA_TICKET_RANDOM","quantity":1}]'),
 ('intermediate',5000,'[{"itemId":"NORMAL_GACHA_TICKET_RANDOM","quantity":1}]'),
 ('advanced',10000,'[{"itemId":"SPECIAL_TICKET_RANDOM","quantity":1}]'),
 ('expert',10000,'[{"itemId":"SPECIAL_TICKET_CHARACTER","quantity":1},{"itemId":"SPECIAL_TICKET_SKILL","quantity":1},{"itemId":"SPECIAL_TICKET_EQUIPMENT","quantity":1}]');
create table public.raid_daily_clear_bonus_ledger (
 raid_day_key date not null,
 user_id uuid not null references public.users(id),
 difficulty text not null references public.raid_daily_clear_bonus_rules(difficulty),
 source_instance_id uuid not null references public.raid_bosses(id),
 source_room_id uuid not null references public.raid_rooms(id),
 won boolean not null,
 items jsonb not null default '[]'::jsonb,
 issued_at timestamptz not null default clock_timestamp(),
 primary key(raid_day_key,user_id,difficulty)
);
alter table public.raid_daily_clear_bonus_rules enable row level security;
alter table public.raid_daily_clear_bonus_ledger enable row level security;
revoke all on public.raid_daily_clear_bonus_rules,public.raid_daily_clear_bonus_ledger from public,anon,authenticated,service_role;
-- One room is one instance (existing unique raid_rooms.raid_boss_instance_id).
-- Existing grants are untouched and never retroactively receive a daily roll.
delete from public.raid_room_clear_reward_items where difficulty in ('beginner','intermediate','advanced','expert');
insert into public.raid_room_clear_reward_items(difficulty,item_id,quantity) values
 ('beginner','SKILL_MANUAL',1),
 ('intermediate','SKILL_MANUAL',1),('intermediate','EQUIP_LB_PART',1),
 ('advanced','SKILL_MANUAL',2),('advanced','EQUIP_LB_PART',2),
 ('expert','SKILL_MANUAL',3),('expert','EQUIP_LB_PART',3);
update public.raid_room_clear_reward_rules set
 enabled=difficulty in ('beginner','intermediate'),
 minimum_contribution_damage=case when difficulty in ('beginner','intermediate') then 0 else null end,
 rule_version=2
 where difficulty in ('beginner','intermediate','advanced','expert');

create function public._issue_raid_daily_clear_bonus_v2(p_room_id uuid,p_user_id uuid) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_daily_clear_bonus_rules%rowtype;v_day date;v_won boolean;v_items jsonb:='[]';v_item jsonb;v_inserted integer;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' or not exists(
  select 1 from public.raid_room_clear_rewards where room_id=p_room_id and user_id=p_user_id and rule_version=2
 ) then raise exception 'Daily bonus requires issued v2 instance clear';end if;
 if not exists(select 1 from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id and enabled and minimum_contribution_damage is not null) then return;end if;
 select * into strict v_rule from public.raid_daily_clear_bonus_rules where difficulty=v_room.difficulty_id for share;
 -- Use the actual clear day, never client time or retry/claim time.
 if coalesce(v_boss.cleared_at,v_boss.outcome_finalized_at) is null then raise exception 'Missing authoritative clear time';end if;
 v_day:=(coalesce(v_boss.cleared_at,v_boss.outcome_finalized_at) at time zone 'Asia/Tokyo')::date;
 v_won:=random()*10000<v_rule.chance_bp;
 if v_won then
  for v_item in select value from jsonb_array_elements(v_rule.items) loop
   v_items:=v_items||jsonb_build_array(jsonb_build_object('itemId',public.resolve_canonical_reward_item(v_item->>'itemId'),'quantity',(v_item->>'quantity')::integer));
  end loop;
 end if;
 -- INSERT is the race winner. Misses also persist; another instance cannot reroll.
 insert into public.raid_daily_clear_bonus_ledger(raid_day_key,user_id,difficulty,source_instance_id,source_room_id,won,items)
 values(v_day,p_user_id,v_room.difficulty_id,v_boss.id,p_room_id,v_won,v_items)
 on conflict do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=0 then return;end if;
 for v_item in select value from jsonb_array_elements(v_items) loop
  perform public._grant_gameplay_reward_v1(p_user_id,'RAID_ROOM_CLEAR','DAILY_CLEAR_BONUS:'||v_day::text||':'||v_room.difficulty_id,v_item->>'itemId',(v_item->>'quantity')::integer);
 end loop;
end $$;
revoke all on function public._issue_raid_daily_clear_bonus_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_raid_reward_policy_v2() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 return (select jsonb_agg(jsonb_build_object(
 'difficulty',r.difficulty,'enabled',r.enabled and r.minimum_contribution_damage is not null,
 'status',case when r.enabled and r.minimum_contribution_damage is not null then 'ACTIVE' else 'PENDING_CONTRIBUTION' end,
 'version',r.rule_version,
 'instanceItems',(select jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty),
 'daily',jsonb_build_object('chanceBp',d.chance_bp,'items',d.items)
 ) order by r.difficulty) from public.raid_room_clear_reward_rules r join public.raid_daily_clear_bonus_rules d using(difficulty));
end $$;
revoke all on function public.get_raid_reward_policy_v2() from public,anon,authenticated,service_role;
grant execute on function public.get_raid_reward_policy_v2() to authenticated;

CREATE OR REPLACE FUNCTION public._issue_raid_room_clear_rewards_v1(p_room_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_member record;v_item record;
 v_progress jsonb;v_items jsonb;v_issued timestamptz;v_present uuid;v_inserted integer;v_count integer:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 -- 呼出元finalizerはReplay→bossを保持済み。別Replay/Userの強いロックを取得しない。
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' then return 0;end if;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id for share;
 if not found or not v_rule.enabled or v_rule.minimum_contribution_damage is null then return 0;end if;
 perform 1 from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id for share;
 if not found then return 0;end if;
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id) into v_items
  from public.raid_room_clear_reward_items where difficulty=v_room.difficulty_id;
 for v_member in select user_id from public.raid_room_members where room_id=p_room_id order by user_id loop
  if exists(select 1 from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_member.user_id) then continue;end if;
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_member.user_id);
  if v_progress->'clearGate'->>'status' is distinct from 'succeeded' then continue;end if;
  v_issued:=clock_timestamp();
  insert into public.raid_room_clear_rewards(room_id,user_id,rule_version,
   finalized_battles,contribution_damage,clear_gate,issued_at,expires_at)
  values(p_room_id,v_member.user_id,v_rule.rule_version,
   (v_progress->>'finalizedBattles')::bigint,(v_progress->>'contributionDamage')::bigint,
   v_progress->'clearGate',v_issued,v_issued+interval '30 days') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then continue;end if;
  -- Clear gate通過・資格ledger新規作成時だけ。retryやitem数では増やさない。
  perform public.evaluate_mission_progress(v_member.user_id, 'RAID_CLEAR_ELIGIBLE', 1);
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_CLEAR',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_clear_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);
  end loop;
  perform public._issue_raid_daily_clear_bonus_v2(p_room_id,v_member.user_id);
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;


CREATE OR REPLACE FUNCTION public._issue_raid_room_rescue_rewards_v1(p_room_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_rescue_reward_rules%rowtype;v_member record;v_item record;
 v_progress jsonb;v_items jsonb;v_issued timestamptz;v_present uuid;v_inserted integer;v_count integer:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 -- 呼出元finalizerはReplay→bossを保持済み。別Replay/Userの強いロックを取得しない。
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if v_boss.outcome is distinct from 'DEFEAT_SUCCESS' then return 0;end if;
 select * into v_rule from public.raid_room_rescue_reward_rules where difficulty=v_room.difficulty_id for share;
 if not found or not v_rule.enabled then return 0;end if;
 perform 1 from public.raid_room_difficulty_rules where difficulty=v_room.difficulty_id for share;
 perform 1 from public.raid_room_rescue_reward_items where difficulty=v_room.difficulty_id for share;
 if not found then return 0;end if;
 select jsonb_agg(jsonb_build_object('item_id',item_id,'quantity',quantity) order by item_id) into v_items
  from public.raid_room_rescue_reward_items where difficulty=v_room.difficulty_id;
 for v_member in select user_id from public.raid_room_rescue_members where room_id=p_room_id order by user_id loop
  if exists(select 1 from public.raid_room_rescue_rewards where room_id=p_room_id and user_id=v_member.user_id) then continue;end if;
  v_progress:=public._raid_room_rescue_reward_progress_v1(p_room_id,v_member.user_id);
  if v_progress->'rescueGate'->>'status' is distinct from 'succeeded' then continue;end if;
  v_issued:=clock_timestamp();
  insert into public.raid_room_rescue_rewards(room_id,user_id,rule_version,reward_version,
   finalized_battles,contribution_damage,rescue_gate,issued_at,expires_at)
  values(p_room_id,v_member.user_id,(v_progress->'rescueGate'->>'ruleVersion')::bigint,v_rule.reward_version,
   (v_progress->>'finalizedBattles')::bigint,(v_progress->>'contributionDamage')::bigint,
   v_progress->'rescueGate',v_issued,v_issued+interval '30 days') on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted=0 then continue;end if;
  for v_item in select * from jsonb_to_recordset(v_items) as item(item_id text,quantity integer) order by item_id loop
   v_present:=public._grant_gameplay_reward_v1(v_member.user_id,'RAID_ROOM_RESCUE',p_room_id::text,v_item.item_id,v_item.quantity);
   insert into public.raid_room_rescue_reward_grants(room_id,user_id,item_id,quantity,present_id,direct_delivery_id)
   values(p_room_id,v_member.user_id,v_item.item_id,v_item.quantity,null,v_present);
  end loop;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;


CREATE OR REPLACE FUNCTION public._raid_room_clear_reward_progress_v1(p_room_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_count bigint:=0;v_damage bigint:=0;v_status text;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id;
 select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
 from public.raid_damage_logs l
 join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
 join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id and s.room_id=p_room_id
 join public.raid_room_members m on m.room_id=p_room_id and m.user_id=p_user_id
 where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
  and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
  and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
  and b.official_context->>'roomId'=p_room_id::text
  and b.finalization_status='FINALIZED'
  and b.finalization_result->'lateFinalization'='false'::jsonb;
 if v_rule.minimum_contribution_damage is null then v_status:='unknown';
 elsif v_count>0 and (v_room.difficulty_id in ('beginner','intermediate') or v_damage>v_rule.minimum_contribution_damage) and v_boss.outcome='DEFEAT_SUCCESS' then v_status:='succeeded';
 else v_status:='not_succeeded';end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'clearGate',jsonb_build_object('status',v_status,'ruleVersion',coalesce(v_rule.rule_version,1),
   'contributionDamage',v_damage,'minimumContributionDamage',v_rule.minimum_contribution_damage,
   'cleared',coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $function$;


CREATE OR REPLACE FUNCTION public.get_raid_room_clear_reward_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_saved public.raid_room_clear_rewards%rowtype;
 v_progress jsonb;v_items jsonb:='[]';v_status text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_saved from public.raid_room_clear_rewards where room_id=p_room_id and user_id=v_uid;
 if found then
  v_status:='issued';v_progress:=jsonb_build_object('clearGate',v_saved.clear_gate);
  select coalesce(jsonb_agg(jsonb_build_object('itemId',g.item_id,'quantity',g.quantity,
   'presentId',g.present_id,'delivery',case when g.direct_delivery_id is not null then 'DIRECT' else 'PRESENT' end,'presentStatus',p.status,'claimedAt',coalesce(d.delivered_at,p.claimed_at),'expiresAt',p.expire_at) order by g.item_id),'[]') into v_items
  from public.raid_room_clear_reward_grants g left join public.presents p on p.id=g.present_id and p.user_id=g.user_id left join public.gameplay_reward_delivery_ledger d on d.id=g.direct_delivery_id and d.user_id=g.user_id
  where g.room_id=p_room_id and g.user_id=v_uid;
 else
  v_progress:=public._raid_room_clear_reward_progress_v1(p_room_id,v_uid);
  if v_progress->'clearGate'->>'status'='unknown' or not exists(
   select 1 from public.raid_room_clear_reward_rules r where r.difficulty=v_room.difficulty_id and r.enabled
    and exists(select 1 from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty)) then v_status:='unconfigured';
  elsif v_progress->'clearGate'->>'status'='succeeded' then v_status:='pending';
  else v_status:='not_eligible';end if;
 end if;
 return jsonb_build_object('roomId',p_room_id,'status',v_status,'clearGate',v_progress->'clearGate',
  'issuedAt',v_saved.issued_at,'expiresAt',case when exists(select 1 from public.raid_room_clear_reward_grants where room_id=p_room_id and user_id=v_uid and present_id is not null) then v_saved.expires_at else null end,'items',v_items,
 'dailyBonus',(select jsonb_build_object('dayKey',d.raid_day_key,'won',d.won,'items',d.items,'sourceRoomId',d.source_room_id,'issuedAt',d.issued_at) from public.raid_daily_clear_bonus_ledger d where d.source_room_id=p_room_id and d.user_id=v_uid));
end $function$;


commit;
