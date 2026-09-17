-- Canonical Raid Room functions/triggers reconstructed from Production READ ONLY authority.
-- Preview-only apply; no Production DDL/DML.
begin;
do $$ begin if to_regnamespace('private') is not null then raise exception 'private schema already exists'; end if; end $$;
create schema private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
CREATE OR REPLACE FUNCTION public._quest_raid_cash_xp_v2(p_patrol uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select jsonb_build_object('cash',coalesce((p.rewards_accrued->>'base_cash')::bigint,q.cash_reward::bigint),
 'userXp',floor(coalesce((p.rewards_accrued->>'xp')::numeric,q.user_exp::numeric)*0.5)::integer)
 from public.user_patrols p join public.canonical_quest_master q
 on q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id) where p.id=p_patrol
$function$;
CREATE OR REPLACE FUNCTION public.finalize_expired_raid_instance(p_instance_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_instance public.raid_bosses%rowtype; v_user record;
begin
 select * into v_instance from public.raid_bosses where id=p_instance_id for update;
 if not found or v_instance.outcome_finalized_at is not null then return; end if;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then return; end if;

 if v_instance.status='ACTIVE' and v_instance.current_hp>0 and v_instance.expires_at>clock_timestamp() then return; end if;
 if v_instance.current_hp=0 then
  update public.raid_bosses set status='CLEARED',outcome='DEFEAT_SUCCESS',outcome_finalized_at=now(),cleared_at=now(),respawn_after=now()+interval '5 minutes',raid_day_key=coalesce(raid_day_key,rotation_date::text) where id=p_instance_id returning * into v_instance;
  for v_user in select user_id from public.raid_instance_user_progress where raid_boss_instance_id=p_instance_id and finalized_battles>0 loop
   perform public.grant_canonical_raid_day_clear_reward(p_instance_id,v_user.user_id);
  end loop;
 else
  update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=now() where id=p_instance_id;
 end if;
end $function$;
CREATE OR REPLACE FUNCTION public.finalize_raid_battle(p_replay_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_replay public.battle_replay_sessions%rowtype;
  v_instance public.raid_bosses%rowtype;
  v_raw bigint;
  v_applied bigint;
  v_remaining bigint;
  v_total bigint;
  v_progress public.raid_instance_user_progress%rowtype;
  v_final jsonb;
begin
  select * into v_replay
  from public.battle_replay_sessions
  where id = p_replay_id
  for update;

  if not found
     or v_replay.battle_mode <> 'RAID'
     or v_replay.resolution_authority <> 'RAID_SERVER' then
    raise exception 'not an official Raid replay' using errcode = '42501';
  end if;
  if v_replay.finalization_status = 'FINALIZED' then
    return v_replay.finalization_result;
  end if;
  if v_replay.status <> 'PENDING'
     or v_replay.finalization_status <> 'PENDING' then
    raise exception 'Raid replay is not finalizable' using errcode = '23514';
  end if;

  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;


 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=v_instance.id) then raise exception 'Room battles require the Room finalization entry point' using errcode='55000'; end if;
  -- 229の非Roomランキングlifecycle hookを復元。Room拒否後にのみ実行。
  perform public.advance_ranking_season('RAID',clock_timestamp());
  perform public.validate_official_battle_result(p_result);
  v_raw := greatest(coalesce((p_result->>'playerRawDamage')::bigint, 0), 0);
  v_applied := least(v_raw, greatest(v_instance.current_hp, 0));
  v_remaining := greatest(v_instance.current_hp - v_applied, 0);

  update public.raid_bosses
  set current_hp = v_remaining
  where id = v_instance.id;

  insert into public.raid_damage_logs(
    boss_id, raid_boss_id, user_id, damage, damage_dealt,
    raid_boss_instance_id, battle_replay_session_id, guild_id,
    raw_damage, applied_damage
  ) values (
    v_instance.boss_id, v_instance.boss_id, v_replay.requester_user_id,
    v_raw, v_raw, v_instance.id, p_replay_id,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid,
    v_raw, v_applied
  );

  insert into public.raid_instance_user_progress(
    raid_boss_instance_id, user_id, finalized_battles,
    raid_points_consumed, last_guild_id
  ) values (
    v_instance.id, v_replay.requester_user_id, 1,
    case when v_replay.official_context->>'costType' = 'RAID_POINT' then 1 else 0 end,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid
  )
  on conflict(raid_boss_instance_id, user_id) do update set
    finalized_battles = public.raid_instance_user_progress.finalized_battles + 1,
    raid_points_consumed = public.raid_instance_user_progress.raid_points_consumed
      + excluded.raid_points_consumed,
    last_guild_id = excluded.last_guild_id,
    updated_at = clock_timestamp()
  returning * into v_progress;

  select coalesce(sum(raw_damage), 0) into v_total
  from public.raid_damage_logs
  where raid_boss_instance_id = v_instance.id
    and user_id = v_replay.requester_user_id;

  v_final := p_result || jsonb_build_object(
    'mode', 'RAID',
    'raidInstanceId', v_instance.id,
    'baseId', v_instance.base_id,
    'raidDayKey', v_instance.raid_day_key,
    'raidVariantId', v_instance.raid_variant_id,
    'rawDamage', v_raw,
    'appliedDamage', v_applied,
    'remainingBossHp', v_remaining,
    'personalContribution', v_total,
    'guildIdSnapshot', v_replay.official_context->>'guildIdSnapshot',
    'participationProgress', to_jsonb(v_progress)
  );

  insert into public.battle_replay_events(
    battle_replay_session_id, event_index, round_number, event_type, payload
  )
  select p_replay_id,
         greatest(coalesce((event.value->>'index')::integer, event.ordinality::integer - 1), 0),
         greatest(coalesce((event.value->>'round')::integer, 1), 1),
         coalesce(nullif(event.value->>'type', ''), 'UNKNOWN'),
         coalesce(event.value->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_result->'events') with ordinality event(value, ordinality)
  on conflict do nothing;

  update public.battle_replay_sessions
  set status = 'RESOLVED',
      result = v_final,
      resolved_at = clock_timestamp(),
      finalization_status = 'FINALIZED',
      finalized_at = clock_timestamp(),
      finalization_result = v_final
  where id = p_replay_id;

  perform public.evaluate_mission_progress(
    v_replay.requester_user_id,
    'RAID_FINALIZED_BATTLE_COUNT',
    1
  );

  if v_remaining = 0 then
    perform public.finalize_expired_raid_instance(v_instance.id);
  end if;
  return v_final;
end
$function$;
CREATE OR REPLACE FUNCTION public.get_active_raids()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_legacy_enabled boolean;
begin if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then return '[]'::jsonb; end if;
 perform public.rotate_daily_raids();
 return coalesce((select jsonb_agg(jsonb_build_object('id',boss.id,'bossMasterId',master.boss_id,'bossName',master.display_name,'profileType',master.profile_type,'attribute',master.attribute,'level',master.reference_level,'currentHp',boss.current_hp,'maxHp',boss.max_hp,'baseId',boss.base_id,'spawnedAt',boss.spawned_at,'expiresAt',boss.expires_at,'status',boss.status,'skillLoadout',master.skill_loadout) order by boss.base_id) from public.raid_bosses boss join public.canonical_raid_boss_master master on master.boss_id=boss.boss_master_id where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id) and boss.status='ACTIVE' and boss.expires_at>clock_timestamp()),'[]'::jsonb);
end $function$;
CREATE OR REPLACE FUNCTION public.grant_canonical_raid_day_clear_reward(p_instance_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_instance public.raid_bosses%rowtype; v_claim public.raid_clear_reward_claims%rowtype; v_item record; v_inserted boolean; v_row_count integer;
begin
 select * into v_instance from public.raid_bosses where id=p_instance_id for update;
 if not found or v_instance.status<>'CLEARED' or v_instance.raid_day_key is null then return jsonb_build_object('eligible',false); end if;

 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then return jsonb_build_object('eligible',false); end if;
 if not exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=p_instance_id and user_id=p_user_id and finalized_battles>0) then return jsonb_build_object('eligible',false); end if;
 insert into public.raid_clear_reward_claims(raid_day_key,user_id,reward_type,source_instance_id)
 values(v_instance.raid_day_key,p_user_id,'CLEAR_REWARD',p_instance_id)
 on conflict do nothing; get diagnostics v_row_count=row_count; v_inserted:=v_row_count=1;
 select * into v_claim from public.raid_clear_reward_claims where raid_day_key=v_instance.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD' for update;
 if v_inserted then
  update public.raid_clear_reward_claims set ticket_roll=random()<0.30,ticket_item_id=public.resolve_canonical_reward_item('NORMAL_GACHA_TICKET_RANDOM'),awakening_roll=random()<0.01
  where raid_day_key=v_instance.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD' returning * into v_claim;
 end if;
 if not v_inserted and v_claim.delivery_status='DELIVERED' then return jsonb_build_object('eligible',true,'already_claimed',true); end if;
 begin
  for v_item in select * from (values('SKILL_MANUAL'::text,1,true),(v_claim.ticket_item_id,1,v_claim.ticket_roll),('AWAKENING_BOOK',1,v_claim.awakening_roll)) x(item_id,quantity,selected) where selected loop
   insert into public.raid_clear_reward_deliveries values(v_claim.raid_day_key,p_user_id,'CLEAR_REWARD',v_item.item_id,v_item.quantity,v_claim.source_instance_id,now()) on conflict do nothing;
   if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user_id,v_item.item_id,v_item.quantity,'レイドクリア報酬','UNCLAIMED',now()+interval '30 days'); end if;
  end loop;
  update public.raid_clear_reward_claims set delivery_status='DELIVERED',delivered_at=now(),last_error=null where raid_day_key=v_claim.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD';
 exception when others then
  update public.raid_clear_reward_claims set delivery_status='PENDING',last_error=sqlstate where raid_day_key=v_claim.raid_day_key and user_id=p_user_id and reward_type='CLEAR_REWARD';
 end;
 return jsonb_build_object('eligible',true,'already_claimed',not v_inserted,'ticket_roll',v_claim.ticket_roll,'awakening_roll',v_claim.awakening_roll);
end $function$;
CREATE OR REPLACE FUNCTION public.grant_canonical_raid_reward(p_instance uuid, p_user uuid, p_type text, p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare row record; granted integer:=0;
begin
 if p_type in ('PERSONAL_RANK','GUILD_RANK') then return 0; end if;
 perform 1 from public.raid_bosses where id=p_instance for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance) then return 0; end if;
 for row in select * from public.canonical_raid_reward_master where version='2026-08-22' and reward_type=p_type and reward_key=p_key loop
 insert into public.raid_production_reward_grants values(p_instance,p_user,p_type,p_key,row.item_id,row.quantity,now()) on conflict do nothing;
 if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user,row.item_id,row.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days'); granted:=granted+1; end if;
 end loop; return granted; end $function$;
CREATE OR REPLACE FUNCTION public.grant_raid_reward(p_instance_id uuid, p_user_id uuid, p_reward_id integer, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_reward record;
begin
  if p_reason in ('RANK_PERSONAL','RANK_GUILD','PERSONAL_RANK','GUILD_RANK') or exists(select 1 from public.raid_rewards_master where id=p_reward_id and reward_type in ('RANK_PERSONAL','RANK_GUILD','PERSONAL_RANK','GUILD_RANK')) then return false; end if;
  perform 1 from public.raid_bosses where id=p_instance_id for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then return false; end if;
  insert into public.raid_reward_grants(raid_boss_instance_id,user_id,reward_id,reward_reason)
  values(p_instance_id,p_user_id,p_reward_id,p_reason) on conflict do nothing;
  if not found then return false; end if;
  select coalesce(reward_item_id,item_id) item_id, greatest(coalesce(reward_quantity,quantity,1),1) quantity
  into v_reward from public.raid_rewards_master where id=p_reward_id;
  insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
  values(p_user_id,v_reward.item_id,v_reward.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days');
  return true;
end; $function$;
CREATE OR REPLACE FUNCTION public.on_canonical_daily_activity_finalized()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_day date:=(new.finalized_at at time zone 'Asia/Tokyo')::date; v_count integer; v_consumed integer; v_key text; v_cash integer; v_ticket integer; v_payload jsonb;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED' then return new; end if;
 if new.battle_mode='PVP' then
  if new.resolution_authority<>'PVP_SERVER' then return new; end if;
  select cash_reward,raid_ticket_reward into strict v_cash,v_ticket
  from public.pvp_match_rewards_master where result=case when new.finalization_result->>'winner'='PLAYER' then 'VICTORY' else 'DEFEAT' end;
  v_key:='PVP_BATTLE:'||new.id::text;
  v_payload:=jsonb_build_array(jsonb_build_object('itemId','CASH','quantity',v_cash,'delivery','INVENTORY'));
  if v_ticket>0 then v_payload:=jsonb_build_array(jsonb_build_object('itemId','RAID_POINT_TICKET','quantity',v_ticket,'delivery','INVENTORY'))||v_payload; end if;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,v_payload,now()) on conflict do nothing;
  if found then
   perform public.grant_present_payload(new.requester_user_id,'CASH',v_cash);
   if v_ticket>0 then perform public.grant_present_payload(new.requester_user_id,'RAID_POINT_TICKET',v_ticket); end if;
  end if;
 elsif new.battle_mode='RAID' then
  if exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then return new; end if;
  v_key:='RAID_BATTLE:'||new.id::text;
  insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,v_key,new.id,'[{"itemId":"EQUIP_EXP_S","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
  if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_EXP_S',1); end if;
  select count(*) into v_count from public.battle_replay_sessions where requester_user_id=new.requester_user_id and battle_mode='RAID' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=battle_replay_sessions.source_reference_id) and finalization_status='FINALIZED' and (finalized_at at time zone 'Asia/Tokyo')::date=v_day;
  if v_count>=3 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_DAILY_3',new.id,'[{"itemId":"CHAR_EXP_M","quantity":1,"delivery":"INVENTORY"},{"itemId":"CASH","quantity":40,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'CHAR_EXP_M',1); perform public.grant_present_payload(new.requester_user_id,'CASH',40); end if;
  end if;
  select coalesce(sum(progress.raid_points_consumed),0) into v_consumed from public.raid_instance_user_progress progress join public.raid_bosses boss on boss.id=progress.raid_boss_instance_id where progress.user_id=new.requester_user_id and boss.raid_day_key=v_day::text and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id);
  if v_consumed>=5 then
   insert into public.canonical_daily_activity_claims values(v_day,new.requester_user_id,'RAID_POINTS_5',new.id,'[{"itemId":"EQUIP_LB_PART","quantity":1,"delivery":"INVENTORY"}]',now()) on conflict do nothing;
   if found then perform public.grant_present_payload(new.requester_user_id,'EQUIP_LB_PART',1); end if;
  end if;
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.on_canonical_guild_official_battle_exp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin if new.finalization_status='FINALIZED' and old.finalization_status is distinct from 'FINALIZED' then
 if new.battle_mode='PVP' and new.resolution_authority='PVP_SERVER' then perform public.grant_canonical_guild_daily_exp(new.requester_user_id,'PVP_FINALIZED',new.id);
 elsif new.battle_mode='RAID' and new.resolution_authority='RAID_SERVER' and not exists(select 1 from public.raid_rooms where raid_boss_instance_id=new.source_reference_id) then perform public.grant_canonical_guild_daily_exp(new.requester_user_id,'RAID_FINALIZED',new.id); end if; end if; return new; end $function$;
CREATE OR REPLACE FUNCTION public.respawn_cleared_raid_slot(p_cleared_instance_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_legacy_enabled boolean; v_old public.raid_bosses%rowtype; v_new uuid;
begin
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then return null; end if;

 perform pg_advisory_xact_lock(hashtextextended(p_cleared_instance_id::text||':respawn',0));
 select * into v_old from public.raid_bosses where id=p_cleared_instance_id and status='CLEARED' and respawn_after<=now() for update;
 if not found then return null; end if;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_cleared_instance_id) then return null; end if;

 if exists(select 1 from public.raid_bosses where raid_day_key=v_old.raid_day_key and base_id=v_old.base_id and status='ACTIVE' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id)) then return null; end if;
 insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_old.boss_id,v_old.boss_master_id,v_old.max_hp,v_old.max_hp,v_old.base_id,'ACTIVE',now(),v_old.expires_at,gen_random_uuid(),v_old.rotation_date,v_old.raid_variant_id,v_old.raid_day_key) returning id into v_new;
 return v_new;
end $function$;
CREATE OR REPLACE FUNCTION public.rotate_daily_raids()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_legacy_enabled boolean; v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date; v_pair text[]; v_area text; v_variant public.canonical_raid_variants%rowtype; v_start timestamptz; v_end timestamptz; v_cleared record;
begin
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then return; end if;

 perform pg_advisory_xact_lock(hashtextextended('CANONICAL_RAID_ROTATION:'||v_today::text,0));
 for v_cleared in select id from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and status='ACTIVE' and (current_hp=0 or expires_at<=now()) for update loop perform public.finalize_expired_raid_instance(v_cleared.id); end loop;
 for v_cleared in select id from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and status='CLEARED' and raid_day_key=v_today::text and respawn_after<=now() for update loop perform public.respawn_cleared_raid_slot(v_cleared.id); end loop;
 v_pair:=public.canonical_raid_rotation_pair(v_today); v_start:=(v_today::timestamp at time zone 'Asia/Tokyo'); v_end:=v_start+interval '24 hours';
 foreach v_area in array v_pair loop
  if not exists(select 1 from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and raid_day_key=v_today::text and base_id=v_area and status='ACTIVE') and not exists(select 1 from public.raid_bosses where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id) and raid_day_key=v_today::text and base_id=v_area and status='CLEARED' and respawn_after>now()) then
   select * into v_variant from public.canonical_raid_variants where area_id=upper(v_area) and is_production_enabled order by raid_variant_id limit 1;
   insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key) values(v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,v_area,'ACTIVE',greatest(now(),v_start),v_end,gen_random_uuid(),v_today,v_variant.raid_variant_id,v_today::text);
  end if;
 end loop;
end $function$;
CREATE OR REPLACE FUNCTION public.start_raid_battle(p_instance_id uuid, p_character_ids text[], p_tactic text DEFAULT 'ATTACK_PRIORITY'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_legacy_enabled boolean; v_uid uuid:=auth.uid(); v_user public.users%rowtype; v_instance record; v_cost integer; v_cost_type text; v_guild uuid; v_players jsonb; v_enemy jsonb:='[]'; v_member text; v_entry record; v_skill_refs jsonb; v_skills jsonb; v_replay uuid; v_seed bigint; v_slot integer:=0;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then raise exception 'legacy Raid entry disabled' using errcode='55000'; end if;

 if p_tactic not in('ATTACK_PRIORITY','HEAL_PRIORITY','SKILL_PRIORITY','BALANCED','WEAKNESS_FOCUS') then raise exception 'invalid tactic' using errcode='22023'; end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid); select * into v_user from public.users where id=v_uid for update;
 if v_user.level<5 then raise exception 'player level 5 is required' using errcode='23514'; end if;
 select boss.*,variant.raid_name,variant.atk,variant.def,variant.spd,variant.member_character_ids into v_instance from public.raid_bosses boss join public.canonical_raid_variants variant on variant.raid_variant_id=boss.raid_variant_id where boss.id=p_instance_id and boss.status='ACTIVE' and boss.expires_at>now() for update of boss;
 if not found then raise exception 'Raid instance is not active' using errcode='P0002'; end if;

 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) then raise exception 'Room battles require the Room entry point' using errcode='55000'; end if;
 if not v_user.raid_free_entry_consumed then v_cost:=0;v_cost_type:='FREE_FIRST';update public.users set raid_free_entry_consumed=true where id=v_uid;
 elsif v_user.raid_points>=1 then v_cost:=1;v_cost_type:='RAID_POINT';update public.users set raid_points=raid_points-1,raid_points_last_recovered_at=case when raid_points=5 then now() else raid_points_last_recovered_at end where id=v_uid;v_user.raid_points:=v_user.raid_points-1;
 else raise exception 'insufficient Raid points' using errcode='23514'; end if;
 select guild_id into v_guild from public.guild_members where user_id=v_uid; v_players:=public.build_server_battle_snapshot(v_uid,p_character_ids,'PLAYER');
 for v_member in select value from jsonb_array_elements_text(v_instance.member_character_ids) loop
  v_slot:=v_slot+1; select * into v_entry from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by(local_affinity)desc,weight desc limit 1;
  v_skill_refs:=coalesce(v_entry.skill_loadout,(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name,'activationType',s.activation_type,'cooldown',s.cooldown,'availableFromRound',s.available_from_round,'target',s.target,'effects',s.effects,'exclusiveCharacterId',s.exclusive_character_id) order by x.ordinality),'[]') into v_skills from jsonb_array_elements_text(v_skill_refs) with ordinality x(skill_id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.skill_id;
  v_enemy:=v_enemy||jsonb_build_array(jsonb_build_object('id','raid_'||v_instance.id||'_'||v_slot,'characterId',v_member,'name',coalesce((select display_name from public.canonical_character_master where version='2026-08-21' and character_id=v_member),v_member),'team','ENEMY','alignment',coalesce((select attribute from public.canonical_character_master where version='2026-08-21' and character_id=v_member),'NEUTRAL'),'level',30,'stats',jsonb_build_object('hp',ceil(v_instance.max_hp::numeric/5),'atk',v_instance.atk,'def',v_instance.def,'spd',v_instance.spd,'luk',0),'equippedSkillRefs',v_skill_refs,'skills',v_skills,'equipment','[]'::jsonb));
 end loop;
 v_seed:=floor(random()*2147483646)::bigint+1;
 insert into public.battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority,finalization_status,official_context) values(v_uid,'RAID',p_instance_id,p_tactic,v_seed,v_players,v_enemy,'RAID_SERVER','PENDING',jsonb_build_object('guildIdSnapshot',v_guild,'costType',v_cost_type,'cost',v_cost,'remainingRaidPoints',v_user.raid_points,'bossHpAtStart',v_instance.current_hp,'bossMaxHp',v_instance.max_hp,'baseId',v_instance.base_id,'raidDayKey',v_instance.raid_day_key,'raidVariantId',v_instance.raid_variant_id)) returning id into v_replay;
 return jsonb_build_object('replay_session_id',v_replay,'player_snapshot',v_players,'enemy_snapshot',v_enemy,'cost_type',v_cost_type,'cost',v_cost,'remaining_raid_points',v_user.raid_points,'guild_id_snapshot',v_guild);
end $function$;
CREATE OR REPLACE FUNCTION public.raid_room_can_read_v1(p_room_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null and exists (
    select 1
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where r.id = p_room_id
      and (
        (
          b.status = 'ACTIVE'
          and b.current_hp > 0
          and b.expires_at > statement_timestamp()
          and b.outcome_finalized_at is null
          and (
            b.raid_day_key like 'DAILY:%'
            or r.owner_user_id = auth.uid()
            or exists (
              select 1 from public.raid_room_members m
              where m.room_id = r.id and m.user_id = auth.uid()
            )
            or exists (
              select 1 from public.raid_instance_user_progress p
              where p.raid_boss_instance_id = r.raid_boss_instance_id
                and p.user_id = auth.uid() and p.finalized_battles > 0
            )
            or exists (
              select 1
              from public.raid_room_rescue_publications rp
              where rp.room_id = r.id
                and (
                  rp.channel = 'ACTIVITY'
                  or (
                    rp.channel = 'GUILD'
                    and exists (
                      select 1 from public.guild_members gm
                      where gm.user_id = auth.uid() and gm.guild_id = rp.guild_id
                    )
                  )
                )
            )
          )
        )
        or r.owner_user_id = auth.uid()
        or exists (
          select 1 from public.raid_room_members m
          where m.room_id = r.id and m.user_id = auth.uid()
        )
        or exists (
          select 1 from public.raid_instance_user_progress p
          where p.raid_boss_instance_id = r.raid_boss_instance_id
            and p.user_id = auth.uid() and p.finalized_battles > 0
        )
      )
  );
$function$;
CREATE OR REPLACE FUNCTION public.raid_room_projection_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'roomId',r.id,'difficultyId',r.difficulty_id,
    'owner',jsonb_build_object('status','available','value',jsonb_build_object(
      'userId',u.id,'name',u.username,'leaderIconUrl',jsonb_build_object('status','unknown'))),
    'state',case when b.status='ACTIVE' and b.current_hp=0 then jsonb_build_object('status','unknown')
      when b.status='ACTIVE' and b.expires_at<=now() then jsonb_build_object('status','available','value','expired')
      when b.status in ('ACTIVE','CLEARED','EXPIRED')
      then jsonb_build_object('status','available','value',lower(b.status))
      else jsonb_build_object('status','unknown') end,
    'createdAt',jsonb_build_object('status','available','value',r.created_at),
    'expiresAt',jsonb_build_object('status','available','value',b.expires_at),
    'endedAt',jsonb_build_object('status','available','value',b.outcome_finalized_at),
    'hp',case when b.current_hp is not null and b.max_hp is not null
      then jsonb_build_object('status','available','value',jsonb_build_object('current',b.current_hp,'max',b.max_hp))
      else jsonb_build_object('status','unknown') end,
    'participantCount',jsonb_build_object('status','available','value',(
      select count(*) from (
        select r.owner_user_id as user_id
        union select m.user_id from public.raid_room_members m where m.room_id=r.id
        union select p.user_id from public.raid_instance_user_progress p
          where p.raid_boss_instance_id=r.raid_boss_instance_id and p.finalized_battles>0
      ) participants)),
    'serverEligibility',jsonb_build_object('status','unknown')
  ) from public.raid_rooms r join public.raid_bosses b on b.id = r.raid_boss_instance_id
    join public.users u on u.id = r.owner_user_id
  where r.id = p_room_id
$function$;
CREATE OR REPLACE FUNCTION public.list_raid_rooms_v1(p_difficulty_id text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_items jsonb; v_count integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000000
    or (p_difficulty_id is not null and p_difficulty_id not in ('beginner','intermediate','advanced','expert')) then
    raise exception 'invalid pagination or difficulty' using errcode='22023';
  end if;
  with page as (
    select r.id,r.created_at from public.raid_rooms r
    where (p_difficulty_id is null or r.difficulty_id=p_difficulty_id)
      and public.raid_room_can_read_v1(r.id)
    order by r.created_at desc,r.id limit p_limit + 1 offset p_offset
  ), numbered as (select *,row_number() over(order by created_at desc,id) n from page)
  select coalesce(jsonb_agg(public.raid_room_projection_v1(id) order by created_at desc,id)
    filter(where n <= p_limit),'[]'::jsonb),count(*) into v_items,v_count from numbered;
  return jsonb_build_object('rooms',v_items,'nextOffset',case when v_count > p_limit then p_offset+p_limit else null end);
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.raid_room_can_read_v1(p_room_id) then
    raise exception 'room unavailable' using errcode='P0002';
  end if;
  return public.raid_room_projection_v1(p_room_id);
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_participants_v1(p_room_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_items jsonb; v_count integer; v_instance uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.raid_rooms r where r.id=p_room_id and (
    r.owner_user_id=auth.uid() or exists(select 1 from public.raid_room_members m where m.room_id=r.id and m.user_id=auth.uid())
    or exists(select 1 from public.raid_instance_user_progress p where p.raid_boss_instance_id=r.raid_boss_instance_id and p.user_id=auth.uid() and p.finalized_battles>0))) then
    raise exception 'room unavailable' using errcode='P0002';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'invalid pagination' using errcode='22023';
  end if;
  select raid_boss_instance_id into v_instance from public.raid_rooms where id=p_room_id;
  with members as (
    select owner_user_id as user_id from public.raid_rooms where id=p_room_id
    union select user_id from public.raid_room_members where room_id=p_room_id
    union select user_id from public.raid_instance_user_progress
      where raid_boss_instance_id=v_instance and finalized_battles>0
  ), page as (
    select m.user_id,coalesce(p.finalized_battles,0) finalized_battles
    from members m left join public.raid_instance_user_progress p
      on p.raid_boss_instance_id=v_instance and p.user_id=m.user_id
    order by m.user_id limit p_limit+1 offset p_offset
  ), numbered as (select *,row_number() over(order by user_id) n from page), projected as (
    select p.n,p.user_id,jsonb_build_object(
      'roomId',p_room_id,
      'player',jsonb_build_object('userId',u.id,'name',u.username,'leaderIconUrl',jsonb_build_object('status','unknown')),
      'currentGuild',case when membership.guild_id is not null and current_guild.id is null
        then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',case when current_guild.id is null then null
          else jsonb_build_object('guildId',current_guild.id,'name',current_guild.name) end) end,
      'battleGuildSnapshot',case when latest.id is null or (latest.guild_id is not null and battle_guild.id is null)
        then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',case when latest.guild_id is null then null
          else jsonb_build_object('guildId',latest.guild_id,'name',battle_guild.name) end) end,
      'finalizedBattles',jsonb_build_object('status','available','value',p.finalized_battles),
      'rawDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',damage.raw_damage) end,
      'appliedDamage',case when damage.log_count=0 then jsonb_build_object('status','unknown')
        else jsonb_build_object('status','available','value',damage.applied_damage) end
    ) dto
    from numbered p join public.users u on u.id=p.user_id
    left join public.guild_members membership on membership.user_id=p.user_id
    left join public.guilds current_guild on current_guild.id=membership.guild_id
    left join lateral (
      select l.id,l.guild_id from public.raid_damage_logs l
      where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id
      order by l.created_at desc,l.id desc limit 1
    ) latest on true
    left join public.guilds battle_guild on battle_guild.id=latest.guild_id
    left join lateral (
      select count(*) log_count,sum(l.raw_damage) raw_damage,sum(l.applied_damage) applied_damage
      from public.raid_damage_logs l where l.raid_boss_instance_id=v_instance and l.user_id=p.user_id
    ) damage on true
  ) select coalesce(jsonb_agg(dto order by user_id) filter(where n<=p_limit),'[]'::jsonb),count(*)
    into v_items,v_count from projected;
  return jsonb_build_object('participants',v_items,'nextOffset',case when v_count>p_limit then p_offset+p_limit else null end);
end $function$;
CREATE OR REPLACE FUNCTION public._raid_room_power_gate_v1(p_difficulty text, p_power bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_minimum bigint;
  v_actual bigint := case when p_power >= 0 then p_power else null end;
  v_status text;
  v_reason text;
begin
  if p_difficulty is null or p_difficulty not in ('beginner', 'intermediate', 'advanced', 'expert') then
    v_status := 'unknown';
    v_reason := 'invalid_difficulty';
  else
    select r.minimum_power into v_minimum
      from public.raid_room_difficulty_rules r where r.difficulty = p_difficulty;
    if not found then
      v_status := 'unknown';
      v_reason := 'rule_unavailable';
    elsif v_minimum is null then
      -- 初級は総合力条件だけを通過。参加許可全体を意味しない。
      v_status := 'passed';
      v_reason := 'no_power_restriction';
    elsif v_actual is null then
      v_status := 'unknown';
      v_reason := case when p_power is null then 'power_unavailable' else 'invalid_power' end;
    elsif v_actual >= v_minimum then
      v_status := 'passed';
      v_reason := 'meets_minimum';
    else
      v_status := 'failed';
      v_reason := 'below_minimum';
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'minimumPower', v_minimum,
    'actualPower', v_actual, 'reason', v_reason);
end;
$function$;
CREATE OR REPLACE FUNCTION public._raid_room_rescue_gate_v1(p_difficulty text, p_via_rescue boolean, p_finalized_battles bigint, p_contribution_damage bigint, p_room_cleared boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rule public.raid_room_difficulty_rules%rowtype;
  v_status text := 'unknown';
  v_reason text;
begin
  if p_difficulty is null or p_difficulty not in ('beginner', 'intermediate', 'advanced', 'expert') then
    v_reason := 'invalid_difficulty';
  else
    select r.* into v_rule from public.raid_room_difficulty_rules r where r.difficulty = p_difficulty;
    if not found then
      v_reason := 'rule_unavailable';
    elsif v_rule.rescue_min_battles is null or v_rule.rescue_min_contribution_damage is null then
      v_reason := 'thresholds_unconfigured';
    elsif p_finalized_battles < 0 or p_contribution_damage < 0 then
      v_reason := 'invalid_input';
    elsif p_via_rescue is null or p_finalized_battles is null
      or p_contribution_damage is null or p_room_cleared is null then
      v_reason := 'input_unavailable';
    elsif p_via_rescue and p_room_cleared
      and p_finalized_battles >= v_rule.rescue_min_battles
      and p_contribution_damage >= v_rule.rescue_min_contribution_damage then
      v_status := 'succeeded';
      v_reason := 'conditions_met';
    else
      v_status := 'not_succeeded';
      v_reason := 'conditions_not_met';
    end if;
  end if;
  return jsonb_build_object('status', v_status, 'reason', v_reason,
    'ruleVersion', v_rule.rule_version,
    'minimumBattles', v_rule.rescue_min_battles,
    'minimumContributionDamage', v_rule.rescue_min_contribution_damage);
end;
$function$;
CREATE OR REPLACE FUNCTION public._raid_room_register_v1(p_instance_id uuid, p_owner_user_id uuid, p_difficulty_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_rule public.raid_room_lifecycle_rules%rowtype;
 v_boss public.raid_bosses%rowtype;
 v_room public.raid_rooms%rowtype;
 v_now timestamptz;
 v_count bigint;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_instance_id is null or p_owner_user_id is null or p_difficulty_id is null then
   raise exception 'invalid registration input' using errcode='22023';
 end if;
 -- 同難度の枠確認と登録を直列化。待機後の別SQLで最新の確定行を数える。
 select * into v_rule from public.raid_room_lifecycle_rules where difficulty=p_difficulty_id for update;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 select * into v_boss from public.raid_bosses where id=p_instance_id for update;
 if not found then raise exception 'instance unavailable' using errcode='P0002'; end if;
 select * into v_room from public.raid_rooms where raid_boss_instance_id=p_instance_id;
 if found then
   if v_room.owner_user_id<>p_owner_user_id or v_room.difficulty_id<>p_difficulty_id then
     raise exception 'registration conflict' using errcode='22023';
   end if;
   -- 終了後の再送も登録済み事実のみ返す。再開・再参加を許可しない。
   return jsonb_build_object('roomId',v_room.id,'status','already_registered');
 end if;
 v_now := clock_timestamp();
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0
   or v_boss.expires_at is null or v_boss.expires_at<=v_now
   or v_boss.outcome_finalized_at is not null then
   raise exception 'instance inactive' using errcode='22023';
 end if;
 if v_boss.spawned_at is null or not isfinite(v_boss.spawned_at) or v_boss.spawned_at>v_now
   or v_boss.expires_at is distinct from v_boss.spawned_at + make_interval(hours=>v_rule.duration_hours) then
   raise exception 'invalid instance lifetime' using errcode='22023';
 end if;
 if v_boss.current_hp is distinct from v_boss.max_hp
   or exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=p_instance_id)
   or exists(select 1 from public.raid_damage_logs where raid_boss_instance_id=p_instance_id) then
   raise exception 'instance already used' using errcode='22023';
 end if;
 select count(*) into v_count from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
 where r.difficulty_id=p_difficulty_id and b.status='ACTIVE' and b.current_hp>0
   and b.expires_at>v_now and b.outcome_finalized_at is null;
 if v_count>=v_rule.max_active_rooms then raise exception 'active room limit reached' using errcode='22023'; end if;
 insert into public.raid_rooms(raid_boss_instance_id,owner_user_id,difficulty_id,created_at)
 values(p_instance_id,p_owner_user_id,p_difficulty_id,v_boss.spawned_at) returning * into v_room;
 insert into public.raid_room_members(room_id,user_id,joined_at) values(v_room.id,p_owner_user_id,v_now);
 return jsonb_build_object('roomId',v_room.id,'status','registered');
end;
$function$;
CREATE OR REPLACE FUNCTION public._raid_room_add_member_v1(p_room_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_room public.raid_rooms%rowtype;
 v_boss public.raid_bosses%rowtype;
 v_capacity integer;
 v_count bigint;
 v_now timestamptz;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_room_id is null or p_user_id is null then raise exception 'invalid membership input' using errcode='22023'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002'; end if;
 -- 戦闘確定と同じInstanceを先にロックし、終了判定と定員判定を直列化する。
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 if not found then raise exception 'instance unavailable' using errcode='P0002'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id for update;
 if not found or v_room.raid_boss_instance_id<>v_boss.id then
   raise exception 'room changed' using errcode='40001';
 end if;
 if v_room.owner_user_id=p_user_id or exists(
   select 1 from public.raid_room_members where room_id=p_room_id and user_id=p_user_id
 ) then
   return jsonb_build_object('roomId',p_room_id,'userId',p_user_id,'status','already_joined');
 end if;
 v_now := clock_timestamp();
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0
   or v_boss.expires_at is null or v_boss.expires_at<=v_now or v_boss.outcome_finalized_at is not null then
   raise exception 'room inactive' using errcode='22023';
 end if;
 select member_capacity into v_capacity from public.raid_room_lifecycle_rules where difficulty=v_room.difficulty_id;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 -- 参照RPCと同じ集合。旧確定参加者が存在する場合も人数から脱落させない。
 select count(*) into v_count from (
   select v_room.owner_user_id as user_id
   union select user_id from public.raid_room_members where room_id=p_room_id
   union select user_id from public.raid_instance_user_progress
     where raid_boss_instance_id=v_boss.id and finalized_battles>0
 ) participants;
 if v_count>=v_capacity and not exists(
   select 1 from public.raid_instance_user_progress
   where raid_boss_instance_id=v_boss.id and user_id=p_user_id and finalized_battles>0
 ) then raise exception 'room full' using errcode='22023'; end if;
 insert into public.raid_room_members(room_id,user_id,joined_at) values(p_room_id,p_user_id,v_now);
 return jsonb_build_object('roomId',p_room_id,'userId',p_user_id,'status','joined');
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_briefing_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_room record;v_level integer;v_power bigint;v_gate jsonb;
 v_joined boolean;v_reason text;v_status text;v_count bigint;v_capacity integer;v_enabled boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select r.*,b.status,b.current_hp,b.expires_at,b.spawned_at,b.outcome_finalized_at,b.base_id,
 b.raid_variant_id,v.raid_name into v_room from public.raid_rooms r
 join public.raid_bosses b on b.id=r.raid_boss_instance_id
 left join public.canonical_raid_variants v on v.raid_variant_id=b.raid_variant_id where r.id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002'; end if;
 select level into v_level from public.users where id=v_uid;
 v_joined:=exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid);
 v_power:=public.calculate_user_total_power(v_uid);
 if v_room.difficulty_id<>'beginner' and not exists(select 1 from public.user_main_formations where user_id=v_uid) then v_power:=null;end if;
 v_gate:=public._raid_room_power_gate_v1(v_room.difficulty_id,v_power);
 v_status:=v_gate->>'status';v_reason:=v_gate->>'reason';
 select member_capacity into v_capacity from public.raid_room_lifecycle_rules where difficulty=v_room.difficulty_id;
 select count(*) into v_count from (
 select v_room.owner_user_id user_id union select user_id from public.raid_room_members where room_id=p_room_id
 union select user_id from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and finalized_battles>0) m;
 if v_level is null or v_level<5 then v_status:='failed';v_reason:='level_requirement';
 elsif v_room.status is distinct from 'ACTIVE' or v_room.current_hp is null or v_room.current_hp<=0
  or v_room.expires_at is null or v_room.expires_at<=now() or v_room.spawned_at is null or v_room.spawned_at>now()
  or v_room.outcome_finalized_at is not null then v_status:='failed';v_reason:='room_ended';
 elsif v_capacity is null then v_status:='unknown';v_reason:='rule_unavailable';
 elsif not v_joined and v_count>=v_capacity then v_status:='failed';v_reason:='room_full';end if;
 select enabled into v_enabled from public.raid_room_battle_settings where singleton;
 return jsonb_build_object('roomId',p_room_id,'raidBossInstanceId',v_room.raid_boss_instance_id,
 'raidVariantId',v_room.raid_variant_id,'bossName',v_room.raid_name,'baseId',v_room.base_id,
 'membershipStatus',case when v_joined then 'joined' else 'not_joined' end,
 'joinEligibility',v_gate||jsonb_build_object('status',v_status,'reason',v_reason),
 'battleStartEnabled',coalesce(v_enabled,false));
end $function$;
CREATE OR REPLACE FUNCTION public.register_raid_room_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_level integer;v_brief jsonb;v_result jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 select level into v_level from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 if exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid) then
 return jsonb_build_object('roomId',p_room_id,'membershipStatus','already_joined');end if;
 v_brief:=public.get_raid_room_briefing_v1(p_room_id);
 if v_brief#>>'{joinEligibility,status}' is distinct from 'passed' then raise exception 'raid participation requirement' using errcode='42501';end if;
 -- private helperがboss/Roomをロック後に期限と定員を再検証する。
 v_result:=public._raid_room_add_member_v1(p_room_id,v_uid);
 return jsonb_build_object('roomId',p_room_id,'membershipStatus',v_result->>'status');
end $function$;
CREATE OR REPLACE FUNCTION public.start_raid_room_battle_v1(p_room_id uuid, p_character_ids text[], p_tactic text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_user public.users%rowtype;v_instance record;v_room public.raid_rooms%rowtype;
 v_request public.raid_room_battle_start_requests%rowtype;v_enabled boolean;v_power bigint;v_gate jsonb;v_response jsonb;
 v_cost integer;v_cost_type text;v_guild uuid;v_players jsonb;v_enemy jsonb:='[]';v_member text;
 v_entry record;v_skill_refs jsonb;v_skills jsonb;v_replay uuid;v_seed bigint;v_slot integer:=0;v_started_at timestamptz;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 if p_room_id is null or p_request_id is null or p_tactic is null
 or p_tactic not in('ATTACK_PRIORITY','HEAL_PRIORITY','SKILL_PRIORITY','BALANCED','WEAKNESS_FOCUS')
 or p_character_ids is null or cardinality(p_character_ids) not between 1 and 5
 or array_position(p_character_ids,null) is not null
 or (select count(distinct x) from unnest(p_character_ids) x)<>cardinality(p_character_ids)
 then raise exception 'invalid battle input' using errcode='22023';end if;
 select enabled into v_enabled from public.raid_room_battle_settings where singleton for share;
 if v_enabled is distinct from true then raise exception 'room battle disabled' using errcode='55000';end if;
 select * into v_user from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 if exists(select 1 from public.raid_room_battle_request_cancellations where user_id=v_uid and request_id=p_request_id)
 then raise exception 'battle request cancelled' using errcode='23514';end if;
 select * into v_request from public.raid_room_battle_start_requests where user_id=v_uid and request_id=p_request_id;
 if found then
 if v_request.room_id<>p_room_id or v_request.character_ids is distinct from p_character_ids or v_request.tactic<>p_tactic
 then raise exception 'request payload conflict' using errcode='22023';end if;
 return v_request.response;end if;
 if v_user.level is null or v_user.level<5 then raise exception 'raid level requirement' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select boss.*,variant.raid_name,variant.atk,variant.def,variant.spd,variant.member_character_ids into v_instance
 from public.raid_bosses boss join public.canonical_raid_variants variant on variant.raid_variant_id=boss.raid_variant_id
 where boss.id=v_room.raid_boss_instance_id and variant.is_production_enabled for update of boss;
 if not found then raise exception 'raid instance unavailable' using errcode='P0002';end if;
 if v_instance.status is distinct from 'ACTIVE' or v_instance.current_hp is null or v_instance.current_hp<=0
 or v_instance.expires_at is null or v_instance.expires_at<=clock_timestamp()
 or v_instance.spawned_at is null or v_instance.spawned_at>clock_timestamp() or v_instance.outcome_finalized_at is not null
 then raise exception 'room ended' using errcode='23514';end if;
 if not exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid)
 then raise exception 'room membership required' using errcode='42501';end if;
 v_players:=public.build_server_battle_snapshot(v_uid,p_character_ids,'PLAYER');
 if v_players is null or jsonb_array_length(v_players)<>cardinality(p_character_ids)
 or (select count(distinct x->>'id') from jsonb_array_elements(v_players) x)<>cardinality(p_character_ids)
 then raise exception 'invalid snapshot' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(v_players) x cross join (values('hp'),('atk'),('def')) k(key)
 where jsonb_typeof(x->'stats'->k.key) is distinct from 'number')
 then raise exception 'invalid snapshot stats' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(v_players) x cross join (values('hp'),('atk'),('def')) k(key)
 where (x->'stats'->>k.key)::numeric<0 or (x->'stats'->>k.key)::numeric>2147483647
 or trunc((x->'stats'->>k.key)::numeric)<>(x->'stats'->>k.key)::numeric
 or (k.key='hp' and (x->'stats'->>k.key)::numeric=0))
 then raise exception 'invalid snapshot stats' using errcode='23514';end if;
 select sum((x#>>'{stats,hp}')::bigint+(x#>>'{stats,atk}')::bigint+(x#>>'{stats,def}')::bigint) into v_power
 from jsonb_array_elements(v_players) x;
 v_gate:=public._raid_room_power_gate_v1(v_room.difficulty_id,v_power);
 if v_gate->>'status' is distinct from 'passed' then raise exception 'raid power requirement' using errcode='42501';end if;
 perform public.sync_and_recover_vitality_and_pvp_points(v_uid);
 select * into v_user from public.users where id=v_uid;
 if v_user.raid_free_entry_consumed is false then
 v_cost:=0;v_cost_type:='FREE_FIRST';update public.users set raid_free_entry_consumed=true where id=v_uid;
 elsif v_user.raid_points>=1 then
 v_cost:=1;v_cost_type:='RAID_POINT';update public.users set raid_points=raid_points-1,
 raid_points_last_recovered_at=case when raid_points=5 then now() else raid_points_last_recovered_at end where id=v_uid;
 v_user.raid_points:=v_user.raid_points-1;
 else raise exception 'insufficient Raid points' using errcode='23514';end if;
 select guild_id into v_guild from public.guild_members where user_id=v_uid;

 select enemy_snapshot into v_enemy from public.raid_room_combat_snapshots where room_id=p_room_id;
 if not found then
 v_enemy := '[]'::jsonb;
 -- Rooms created before this delta retain the original enemy construction.
 for v_member in select value from jsonb_array_elements_text(v_instance.member_character_ids) loop
  v_slot:=v_slot+1; select * into v_entry from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by(local_affinity)desc,weight desc limit 1;
  v_skill_refs:=coalesce(v_entry.skill_loadout,(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),(select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name,'activationType',s.activation_type,'cooldown',s.cooldown,'availableFromRound',s.available_from_round,'target',s.target,'effects',s.effects,'exclusiveCharacterId',s.exclusive_character_id) order by x.ordinality),'[]') into v_skills from jsonb_array_elements_text(v_skill_refs) with ordinality x(skill_id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.skill_id;
  v_enemy:=v_enemy||jsonb_build_array(jsonb_build_object('id','raid_'||v_instance.id||'_'||v_slot,'characterId',v_member,'name',coalesce((select display_name from public.canonical_character_master where version='2026-08-21' and character_id=v_member),v_member),'team','ENEMY','alignment',coalesce((select attribute from public.canonical_character_master where version='2026-08-21' and character_id=v_member),'NEUTRAL'),'level',30,'stats',jsonb_build_object('hp',ceil(v_instance.max_hp::numeric/5),'atk',v_instance.atk,'def',v_instance.def,'spd',v_instance.spd,'luk',0),'equippedSkillRefs',v_skill_refs,'skills',v_skills,'equipment','[]'::jsonb));
 end loop;
 end if;
 if jsonb_array_length(v_enemy)<>5 then raise exception 'invalid enemy formation' using errcode='23514';end if;
 v_started_at:=clock_timestamp();
 if v_instance.expires_at<=v_started_at then raise exception 'room ended' using errcode='23514';end if;
 v_seed:=floor(random()*2147483646)::bigint+1;
 insert into public.battle_replay_sessions(requester_user_id,battle_mode,source_reference_id,tactic_id,random_seed,player_snapshot,enemy_snapshot,resolution_authority,finalization_status,official_context)
 values(v_uid,'RAID',v_instance.id,p_tactic,v_seed,v_players,v_enemy,'RAID_SERVER','PENDING',
 jsonb_build_object('guildIdSnapshot',v_guild,'costType',v_cost_type,'cost',v_cost,'remainingRaidPoints',v_user.raid_points,
 'bossHpAtStart',v_instance.current_hp,'bossMaxHp',v_instance.max_hp,'baseId',v_instance.base_id,
 'raidDayKey',v_instance.raid_day_key,'raidVariantId',v_instance.raid_variant_id,
 'roomId',p_room_id,'raidRoomVersion',1,'difficultyId',v_room.difficulty_id,'formationPower',v_power,
 'roomExpiresAt',v_instance.expires_at,'startedAt',v_started_at)) returning id into v_replay;
 v_response:=jsonb_build_object('room_id',p_room_id,'replay_session_id',v_replay,'player_snapshot',v_players,
 'enemy_snapshot',v_enemy,'cost_type',v_cost_type,'cost',v_cost,'remaining_raid_points',v_user.raid_points,'guild_id_snapshot',v_guild);
 insert into public.raid_room_battle_start_requests(user_id,request_id,room_id,character_ids,tactic,replay_session_id,response)
 values(v_uid,p_request_id,p_room_id,p_character_ids,p_tactic,v_replay,v_response);
 return v_response;
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_battle_route_v1(p_replay_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_replay public.battle_replay_sessions%rowtype; v_room public.raid_rooms%rowtype;
begin
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id;
 if not found or v_replay.battle_mode<>'RAID' or v_replay.resolution_authority<>'RAID_SERVER' then
  raise exception 'official Raid replay required' using errcode='42501'; end if;
 select * into v_room from public.raid_rooms where raid_boss_instance_id=v_replay.source_reference_id;
 if not found then
  if v_replay.official_context ? 'roomId' or exists(select 1 from public.raid_room_battle_start_requests where replay_session_id=p_replay_id) then
   raise exception 'Room authority mismatch' using errcode='23514'; end if;
  return 'LEGACY';
 end if;
 if v_replay.official_context->>'roomId' is distinct from v_room.id::text
 or v_replay.official_context->>'raidRoomVersion' is distinct from '1'
 or not exists(select 1 from public.raid_room_battle_start_requests q
  where q.replay_session_id=p_replay_id and q.user_id=v_replay.requester_user_id and q.room_id=v_room.id
   and q.tactic=v_replay.tactic_id and q.response->>'replay_session_id'=p_replay_id::text
   and q.response->>'room_id'=v_room.id::text)
 then raise exception 'Room start receipt missing or mismatched' using errcode='23514'; end if;
 return 'ROOM';
end $function$;
CREATE OR REPLACE FUNCTION public.finalize_expired_raid_room_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_instance public.raid_bosses%rowtype; v_now timestamptz;
begin
 select b.* into v_instance from public.raid_bosses b join public.raid_rooms r on r.raid_boss_instance_id=b.id
 where r.id=p_room_id for update of b;
 if not found then raise exception 'Room missing' using errcode='P0002'; end if;
 v_now:=clock_timestamp();
 if v_instance.status='ACTIVE' and v_instance.outcome_finalized_at is null and v_instance.expires_at<=v_now then
  update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=v_now
  where id=v_instance.id returning * into v_instance;
 end if;
 return jsonb_build_object('roomId',p_room_id,'state',lower(v_instance.status),'outcome',v_instance.outcome,'remainingBossHp',v_instance.current_hp);
end $function$;
CREATE OR REPLACE FUNCTION public.finalize_raid_room_battle_v1(p_replay_id uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_replay public.battle_replay_sessions%rowtype;
  v_instance public.raid_bosses%rowtype;
  v_room public.raid_rooms%rowtype;
  v_now timestamptz;
  v_late boolean;
  v_raw bigint;
  v_applied bigint;
  v_remaining bigint;
  v_total bigint;
  v_progress public.raid_instance_user_progress%rowtype;
  v_final jsonb;
begin
  select * into v_replay
  from public.battle_replay_sessions
  where id = p_replay_id
  for update;

  if not found
     or v_replay.battle_mode <> 'RAID'
     or v_replay.resolution_authority <> 'RAID_SERVER' then
    raise exception 'not an official Raid replay' using errcode = '42501';
  end if;
  if public.get_raid_battle_route_v1(p_replay_id)<>'ROOM' then
    raise exception 'Room replay required' using errcode='42501';
  end if;
  if v_replay.finalization_status = 'FINALIZED' then
    return v_replay.finalization_result;
  end if;
  if v_replay.status <> 'PENDING'
     or v_replay.finalization_status <> 'PENDING' then
    raise exception 'Raid replay is not finalizable' using errcode = '23514';
  end if;

  perform public.validate_official_battle_result(p_result);
  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;

  select * into strict v_room from public.raid_rooms where raid_boss_instance_id=v_instance.id;
  -- 開始時刻は255が生成したもの。期限前に正規開始済みの戦闘だけを保存する。
  if v_replay.official_context->>'startedAt' is null
    or (v_replay.official_context->>'startedAt')::timestamptz>=v_instance.expires_at then
    raise exception 'Room battle did not start before expiry' using errcode='23514'; end if;
  v_now:=clock_timestamp();
  v_late:=v_instance.status<>'ACTIVE' or v_instance.outcome_finalized_at is not null
    or v_instance.expires_at<=v_now or v_instance.current_hp<=0;
  v_raw := greatest(coalesce((p_result->>'playerRawDamage')::bigint, 0), 0);
  v_applied := case when v_late then 0 else least(v_raw,greatest(v_instance.current_hp,0)) end;
  v_remaining := greatest(v_instance.current_hp-v_applied,0);
  if not v_late then
    update public.raid_bosses set current_hp=v_remaining,
      status=case when v_remaining=0 then 'CLEARED' else status end,
      outcome=case when v_remaining=0 then 'DEFEAT_SUCCESS' else outcome end,
      outcome_finalized_at=case when v_remaining=0 then v_now else outcome_finalized_at end,
      cleared_at=case when v_remaining=0 then v_now else cleared_at end
    where id=v_instance.id returning * into v_instance;
  elsif v_instance.status='ACTIVE' and v_instance.outcome_finalized_at is null and v_instance.expires_at<=v_now then
    update public.raid_bosses set status='EXPIRED',outcome='TIMEOUT_FAILURE',outcome_finalized_at=v_now
    where id=v_instance.id returning * into v_instance;
  end if;

  insert into public.raid_damage_logs(
    boss_id, raid_boss_id, user_id, damage, damage_dealt,
    raid_boss_instance_id, battle_replay_session_id, guild_id,
    raw_damage, applied_damage
  ) values (
    v_instance.boss_id, v_instance.boss_id, v_replay.requester_user_id,
    v_raw, v_raw, v_instance.id, p_replay_id,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid,
    v_raw, v_applied
  );

  insert into public.raid_instance_user_progress(
    raid_boss_instance_id, user_id, finalized_battles,
    raid_points_consumed, last_guild_id
  ) values (
    v_instance.id, v_replay.requester_user_id, 1,
    case when v_replay.official_context->>'costType' = 'RAID_POINT' then 1 else 0 end,
    nullif(v_replay.official_context->>'guildIdSnapshot', '')::uuid
  )
  on conflict(raid_boss_instance_id, user_id) do update set
    finalized_battles = public.raid_instance_user_progress.finalized_battles + 1,
    raid_points_consumed = public.raid_instance_user_progress.raid_points_consumed
      + excluded.raid_points_consumed,
    last_guild_id = excluded.last_guild_id,
    updated_at = clock_timestamp()
  returning * into v_progress;

  select coalesce(sum(raw_damage), 0) into v_total
  from public.raid_damage_logs
  where raid_boss_instance_id = v_instance.id
    and user_id = v_replay.requester_user_id;

  v_final := p_result || jsonb_build_object(
    'mode', 'RAID',
    'roomId', v_room.id,
    'roomOutcome', v_instance.outcome,
    'lateFinalization', v_late,
    'raidInstanceId', v_instance.id,
    'baseId', v_instance.base_id,
    'raidDayKey', v_instance.raid_day_key,
    'raidVariantId', v_instance.raid_variant_id,
    'rawDamage', v_raw,
    'appliedDamage', v_applied,
    'remainingBossHp', v_remaining,
    'personalContribution', v_total,
    'guildIdSnapshot', v_replay.official_context->>'guildIdSnapshot',
    'participationProgress', to_jsonb(v_progress)
  );

  insert into public.battle_replay_events(
    battle_replay_session_id, event_index, round_number, event_type, payload
  )
  select p_replay_id,
         greatest(coalesce((event.value->>'index')::integer, event.ordinality::integer - 1), 0),
         greatest(coalesce((event.value->>'round')::integer, 1), 1),
         coalesce(nullif(event.value->>'type', ''), 'UNKNOWN'),
         coalesce(event.value->'payload', '{}'::jsonb)
  from jsonb_array_elements(p_result->'events') with ordinality event(value, ordinality)
  on conflict do nothing;

  update public.battle_replay_sessions
  set status = 'RESOLVED',
      result = v_final,
      resolved_at = clock_timestamp(),
      finalization_status = 'FINALIZED',
      finalized_at = clock_timestamp(),
      finalization_result = v_final
  where id = p_replay_id;

  -- Replay行lockとFINALIZED早期returnにより、正式確定ごとに1回だけ加算。
  perform public.evaluate_mission_progress(v_replay.requester_user_id, 'RAID_FINALIZED', 1);
  return v_final;
end
$function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_battle_result_v1(p_replay_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_replay public.battle_replay_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_replay from public.battle_replay_sessions where id=p_replay_id and requester_user_id=auth.uid();
 if not found then raise exception 'owned replay missing' using errcode='P0002'; end if;
 if public.get_raid_battle_route_v1(p_replay_id)<>'ROOM' then raise exception 'Room replay required' using errcode='42501'; end if;
 if v_replay.finalization_status='FINALIZED' then return v_replay.finalization_result; end if;
 return null;
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_battle_start_receipt_v1(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_request public.raid_room_battle_start_requests%rowtype;
 v_replay public.battle_replay_sessions%rowtype;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'request id required' using errcode='22023'; end if;
 select * into v_request from public.raid_room_battle_start_requests
 where user_id=v_uid and request_id=p_request_id;
 if not found then return null; end if;
 select * into v_replay from public.battle_replay_sessions
 where id=v_request.replay_session_id and requester_user_id=v_uid;
 if not found then raise exception 'owned Room replay missing' using errcode='23514'; end if;
 if public.get_raid_battle_route_v1(v_request.replay_session_id) is distinct from 'ROOM'
 or v_request.room_id::text is distinct from v_replay.official_context->>'roomId'
 or v_request.tactic is distinct from v_replay.tactic_id
 or v_request.response->>'replay_session_id' is distinct from v_replay.id::text
 or v_request.response->>'room_id' is distinct from v_request.room_id::text
 or v_request.response->'player_snapshot' is distinct from v_replay.player_snapshot
 or v_request.response->'enemy_snapshot' is distinct from v_replay.enemy_snapshot then
  raise exception 'Room start receipt mismatch' using errcode='23514';
 end if;
 return v_request.response;
end $function$;
CREATE OR REPLACE FUNCTION public.finalize_expired_raid_rooms_v1(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_room record;
 v_now timestamptz:=clock_timestamp();
 v_count integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>1000 then
  raise exception 'batch limit must be between 1 and 1000' using errcode='22023';
 end if;
 for v_room in
  select r.id from public.raid_rooms r
  join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where b.status='ACTIVE' and b.outcome_finalized_at is null and b.expires_at<=v_now
  order by b.expires_at,b.id limit p_limit for update of b skip locked
 loop
  perform public.finalize_expired_raid_room_v1(v_room.id);
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;
CREATE OR REPLACE FUNCTION public.list_raid_room_battle_recoveries_v1(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_request record;v_receipt jsonb;v_items jsonb:='[]'::jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'limit must be between 1 and 100' using errcode='22023';end if;
 for v_request in select * from public.raid_room_battle_start_requests
 where user_id=v_uid and recovery_acknowledged_at is null
 order by created_at,request_id limit p_limit
 loop
  v_receipt:=public.get_raid_room_battle_start_receipt_v1(v_request.request_id);
  if v_receipt is null then raise exception 'Room start receipt missing' using errcode='23514';end if;
  v_items:=v_items||jsonb_build_array(jsonb_build_object(
   'requestId',v_request.request_id,'roomId',v_request.room_id,
   'payload',jsonb_build_object('p_room_id',v_request.room_id,'p_character_ids',v_request.character_ids,
    'p_tactic',v_request.tactic,'p_request_id',v_request.request_id),'receipt',v_receipt));
 end loop;
 return v_items;
end $function$;
CREATE OR REPLACE FUNCTION public.acknowledge_raid_room_battle_recovery_v1(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_request public.raid_room_battle_start_requests%rowtype;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'request id required' using errcode='22023';end if;
 select * into v_request from public.raid_room_battle_start_requests
 where user_id=v_uid and request_id=p_request_id for update;
 if not found then raise exception 'owned Room start request missing' using errcode='P0002';end if;
 perform public.get_raid_room_battle_start_receipt_v1(p_request_id);
 if not exists(select 1 from public.battle_replay_sessions where id=v_request.replay_session_id
  and requester_user_id=v_uid and finalization_status='FINALIZED') then
  raise exception 'Room battle not finalized' using errcode='23514';end if;
 update public.raid_room_battle_start_requests
 set recovery_acknowledged_at=coalesce(recovery_acknowledged_at,clock_timestamp())
 where user_id=v_uid and request_id=p_request_id;
 return jsonb_build_object('status','acknowledged','requestId',p_request_id);
end $function$;
CREATE OR REPLACE FUNCTION public.cancel_raid_room_battle_request_v1(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_receipt jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 if p_request_id is null then raise exception 'request id required' using errcode='22023';end if;
 perform 1 from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 v_receipt:=public.get_raid_room_battle_start_receipt_v1(p_request_id);
 if v_receipt is not null then return jsonb_build_object('status','started','receipt',v_receipt);end if;
 insert into public.raid_room_battle_request_cancellations(user_id,request_id)
 values(v_uid,p_request_id) on conflict(user_id,request_id) do nothing;
 return jsonb_build_object('status','cancelled');
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_rescue_v1(p_rescue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_publication public.raid_room_rescue_publications%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_publication from public.raid_room_rescue_publications where id=p_rescue_id;
 if not found then raise exception 'rescue unavailable' using errcode='P0002';end if;
 if v_publication.channel='GUILD' and not exists(select 1 from public.guild_members where user_id=auth.uid() and guild_id=v_publication.guild_id) then
 raise exception 'guild membership required' using errcode='42501';end if;
 return jsonb_build_object('rescueId',v_publication.id,'roomId',v_publication.room_id,'channel',v_publication.channel,'guildId',v_publication.guild_id);
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_rescue_status_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_activity integer;v_guild integer;v_member public.raid_room_rescue_members%rowtype;v_count bigint:=0;v_damage bigint:=0;
 v_via boolean;v_enabled boolean;v_has_guild boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select count(*) filter(where channel='ACTIVITY'),count(*) filter(where channel='GUILD') into v_activity,v_guild from public.raid_room_rescue_publications where room_id=p_room_id;
 select * into v_member from public.raid_room_rescue_members where room_id=p_room_id and user_id=v_uid;
 v_via:=found;
 if v_via then
  select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
  from public.raid_damage_logs l join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
  where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=v_uid
   and b.requester_user_id=v_uid and b.source_reference_id=v_room.raid_boss_instance_id
   and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
   and b.finalization_status='FINALIZED' and b.finalized_at>=v_member.joined_at;
 end if;
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton;
 select exists(select 1 from public.guild_members where user_id=v_uid) into v_has_guild;
 return jsonb_build_object('roomId',p_room_id,'isOwner',v_room.owner_user_id=v_uid,
 'requestEnabled',coalesce(v_enabled,false) and v_room.owner_user_id=v_uid and v_boss.status='ACTIVE' and v_boss.current_hp>0 and v_boss.expires_at>statement_timestamp() and v_boss.outcome_finalized_at is null and (v_activity<3 or (v_has_guild and v_guild<3)),
 'activityCount',v_activity,'guildCount',v_guild,'maxPerChannel',3,
 'viaRescue',v_via,'finalizedBattles',v_count,'contributionDamage',v_damage,
 'rescueGate',public._raid_room_rescue_gate_v1(v_room.difficulty_id,v_via,v_count,v_damage,coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $function$;
CREATE OR REPLACE FUNCTION public.request_raid_room_rescue_v1(p_room_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_saved public.raid_room_rescue_requests%rowtype;v_name text;v_avatar text;v_guild_id uuid;
 v_activity integer;v_guild integer;v_enabled boolean;v_id uuid;v_publications jsonb:='[]';v_result jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if p_room_id is null or p_request_id is null then raise exception 'invalid rescue input' using errcode='22023';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 -- 設定→user→boss→Room: 開始/参加と同じ順序。設定の切替とも直列化する。
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton for share;
 select username,avatar_url into v_name,v_avatar from public.users where id=v_uid for no key update;
 if not found or v_name is null then raise exception 'user unavailable' using errcode='42501';end if;
 select * into v_saved from public.raid_room_rescue_requests where user_id=v_uid and request_id=p_request_id;
 if found then
  if v_saved.room_id<>p_room_id then raise exception 'request payload mismatch' using errcode='22023';end if;
  return v_saved.response;
 end if;
 if v_enabled is distinct from true then raise exception 'rescue disabled' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 if v_room.owner_user_id<>v_uid then raise exception 'room owner required' using errcode='42501';end if;
 select * into v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id for update;
 perform 1 from public.raid_rooms where id=p_room_id for update;
 if v_boss.status is distinct from 'ACTIVE' or v_boss.current_hp is null or v_boss.current_hp<=0 or v_boss.expires_at is null or v_boss.expires_at<=clock_timestamp() or v_boss.outcome_finalized_at is not null then raise exception 'room inactive' using errcode='22023';end if;
 select guild_id into v_guild_id from public.guild_members where user_id=v_uid for share;
 select count(*) filter(where channel='ACTIVITY'),count(*) filter(where channel='GUILD') into v_activity,v_guild from public.raid_room_rescue_publications where room_id=p_room_id;
 if v_activity>=3 and (v_guild_id is null or v_guild>=3) then raise exception 'rescue publication limit' using errcode='22023';end if;
 if v_activity<3 then
  v_activity:=v_activity+1;
  insert into public.raid_room_rescue_publications(room_id,requester_user_id,request_id,channel,ordinal)
   values(p_room_id,v_uid,p_request_id,'ACTIVITY',v_activity) returning id into v_id;
  insert into public.social_activity_feed(activity_type,actor_user_id,actor_display_name,display_payload)
   values('RAID_HELP_REQUEST',v_uid,v_name,jsonb_build_object('roomId',p_room_id,'rescueId',v_id));
  v_publications:=v_publications||jsonb_build_array(jsonb_build_object('rescueId',v_id,'channel','ACTIVITY','guildId',null));
 end if;
 if v_guild_id is not null and v_guild<3 then
  v_guild:=v_guild+1;
  insert into public.raid_room_rescue_publications(room_id,requester_user_id,request_id,channel,guild_id,ordinal)
   values(p_room_id,v_uid,p_request_id,'GUILD',v_guild_id,v_guild) returning id into v_id;
  -- システム投稿: 発言報酬/mission/KPI/human responseとchatters集計へ混入させない。
  insert into public.board_posts(title,content,author_id,user_id,author_name,author_avatar_url,target_type,target_id,is_system,raid_rescue_id)
   values('','レイドの救援をお願いします。',v_uid,null,v_name,v_avatar,'GUILD',v_guild_id,true,v_id);
  v_publications:=v_publications||jsonb_build_array(jsonb_build_object('rescueId',v_id,'channel','GUILD','guildId',v_guild_id));
 end if;
 v_result:=jsonb_build_object('roomId',p_room_id,'requestId',p_request_id,'publications',v_publications,'activityCount',v_activity,'guildCount',v_guild,'maxPerChannel',3);
 insert into public.raid_room_rescue_requests values(v_uid,p_request_id,p_room_id,v_result);
 return v_result;
end $function$;
CREATE OR REPLACE FUNCTION public.join_raid_room_rescue_v1(p_rescue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_ref jsonb;v_room uuid;v_result jsonb;v_via boolean;v_enabled boolean;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 select enabled into v_enabled from public.raid_room_rescue_settings where singleton for share;
 if v_enabled is distinct from true then raise exception 'rescue disabled' using errcode='42501';end if;
 perform 1 from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 v_ref:=public.get_raid_room_rescue_v1(p_rescue_id);v_room:=(v_ref->>'roomId')::uuid;
 -- 通常登録と同じuserロック下で加入。既存通常参加を救援へ昇格させない。
 v_result:=public.register_raid_room_v1(v_room);
 if v_result->>'membershipStatus'='joined' and not exists(select 1 from public.raid_rooms where id=v_room and owner_user_id=v_uid) then
  insert into public.raid_room_rescue_members(room_id,user_id,rescue_id,joined_at)
   select room_id,user_id,p_rescue_id,joined_at from public.raid_room_members where room_id=v_room and user_id=v_uid;
 end if;
 select exists(select 1 from public.raid_room_rescue_members where room_id=v_room and user_id=v_uid) into v_via;
 return v_result||jsonb_build_object('viaRescue',v_via);
end $function$;
CREATE OR REPLACE FUNCTION public._raid_room_rescue_reward_progress_v1(p_room_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_member public.raid_room_rescue_members%rowtype;v_via boolean;v_count bigint:=0;v_damage bigint:=0;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_member from public.raid_room_rescue_members where room_id=p_room_id and user_id=p_user_id;
 v_via:=found and v_room.owner_user_id<>p_user_id;
 if v_via then
  select count(*),coalesce(sum(l.raw_damage),0) into v_count,v_damage
  from public.raid_damage_logs l
  join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
  join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id and s.room_id=p_room_id
  where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
   and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
   and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
   and b.official_context->>'roomId'=p_room_id::text
   and b.finalization_status='FINALIZED' and b.finalized_at>=v_member.joined_at
   and (b.official_context->>'startedAt')::timestamptz>=v_member.joined_at
   and (b.official_context->>'startedAt')::timestamptz<v_boss.expires_at
   and (v_boss.outcome_finalized_at is null or (b.official_context->>'startedAt')::timestamptz<v_boss.outcome_finalized_at);
 end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'rescueGate',public._raid_room_rescue_gate_v1(v_room.difficulty_id,v_via,v_count,v_damage,
    coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
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
CREATE OR REPLACE FUNCTION public.on_raid_room_rescue_reward_finalized_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room uuid;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED'
  or new.battle_mode<>'RAID' or new.resolution_authority<>'RAID_SERVER' then return new;end if;
 select id into v_room from public.raid_rooms where raid_boss_instance_id=new.source_reference_id;
 if found then perform public._issue_raid_room_rescue_rewards_v1(v_room);end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_rescue_reward_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_uid uuid:=auth.uid();v_room public.raid_rooms%rowtype;v_saved public.raid_room_rescue_rewards%rowtype;
 v_progress jsonb;v_items jsonb:='[]';v_status text;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501';end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found then raise exception 'room unavailable' using errcode='P0002';end if;
 select * into v_saved from public.raid_room_rescue_rewards where room_id=p_room_id and user_id=v_uid;
 if found then
  v_status:='issued';v_progress:=jsonb_build_object('rescueGate',v_saved.rescue_gate);
  select coalesce(jsonb_agg(jsonb_build_object('itemId',g.item_id,'quantity',g.quantity,
   'presentId',g.present_id,'delivery',case when g.direct_delivery_id is not null then 'DIRECT' else 'PRESENT' end,'presentStatus',p.status,'claimedAt',coalesce(d.delivered_at,p.claimed_at),'expiresAt',p.expire_at) order by g.item_id),'[]') into v_items
  from public.raid_room_rescue_reward_grants g left join public.presents p on p.id=g.present_id and p.user_id=g.user_id left join public.gameplay_reward_delivery_ledger d on d.id=g.direct_delivery_id and d.user_id=g.user_id
  where g.room_id=p_room_id and g.user_id=v_uid;
 else
  v_progress:=public._raid_room_rescue_reward_progress_v1(p_room_id,v_uid);
  if v_progress->'rescueGate'->>'status'='unknown' or not exists(
   select 1 from public.raid_room_rescue_reward_rules r where r.difficulty=v_room.difficulty_id and r.enabled
    and exists(select 1 from public.raid_room_rescue_reward_items i where i.difficulty=r.difficulty)) then v_status:='unconfigured';
  elsif v_progress->'rescueGate'->>'status'='succeeded' then v_status:='pending';
  else v_status:='not_eligible';end if;
 end if;
 return jsonb_build_object('roomId',p_room_id,'status',v_status,'rescueGate',v_progress->'rescueGate',
  'issuedAt',v_saved.issued_at,'expiresAt',case when exists(select 1 from public.raid_room_rescue_reward_grants where room_id=p_room_id and user_id=v_uid and present_id is not null) then v_saved.expires_at else null end,'items',v_items);
end $function$;
CREATE OR REPLACE FUNCTION public.get_my_raid_contribution_v1(p_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid(); v_day text; v_room boolean; v_contribution bigint;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select raid_day_key into v_day from public.raid_bosses where id=p_instance_id;
 if not found then raise exception 'Raid not found' using errcode='P0002'; end if;
 select exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance_id) into v_room;
 select coalesce(sum(log.raw_damage),0) into v_contribution
 from public.raid_damage_logs log join public.raid_bosses boss on boss.id=log.raid_boss_instance_id
 where log.user_id=v_uid and ((v_room and boss.id=p_instance_id) or (not v_room and boss.raid_day_key=v_day));
 return jsonb_build_object('contribution',v_contribution);
end $function$;
CREATE OR REPLACE FUNCTION public._raid_room_clear_reward_progress_v1(p_room_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room public.raid_rooms%rowtype;v_boss public.raid_bosses%rowtype;
 v_rule public.raid_room_clear_reward_rules%rowtype;v_count bigint:=0;v_damage bigint:=0;v_status text;v_min bigint;
begin
 select * into strict v_room from public.raid_rooms where id=p_room_id;
 select * into strict v_boss from public.raid_bosses where id=v_room.raid_boss_instance_id;
 select * into v_rule from public.raid_room_clear_reward_rules where difficulty=v_room.difficulty_id;
 select count(*),coalesce(sum(greatest(coalesce(l.applied_damage,0),0)),0) into v_count,v_damage
 from public.raid_damage_logs l
 join public.battle_replay_sessions b on b.id=l.battle_replay_session_id
 join public.raid_room_battle_start_requests s on s.replay_session_id=b.id and s.user_id=p_user_id
 join public.raid_rooms sr on sr.id=s.room_id and sr.raid_boss_instance_id=v_room.raid_boss_instance_id
 join public.raid_room_members m on m.room_id=sr.id and m.user_id=p_user_id
 where l.raid_boss_instance_id=v_room.raid_boss_instance_id and l.user_id=p_user_id
  and b.requester_user_id=p_user_id and b.source_reference_id=v_room.raid_boss_instance_id
  and b.battle_mode='RAID' and b.resolution_authority='RAID_SERVER'
  and b.official_context->>'roomId'=sr.id::text
  and b.finalization_status='FINALIZED'
  and b.finalization_result->'lateFinalization'='false'::jsonb; -- Server non-late flag includes the killing battle; finalized_at is written after cleared_at.
 v_min:=ceil(v_boss.max_hp::numeric*v_rule.minimum_contribution_bp/10000)::bigint;
 if not coalesce(v_rule.enabled,false) or v_min is null then v_status:='unknown';
 elsif v_count>0 and (v_room.difficulty_id in ('beginner','intermediate') or v_damage>=v_min) and v_boss.outcome='DEFEAT_SUCCESS' then v_status:='succeeded';
 else v_status:='not_succeeded';end if;
 return jsonb_build_object('finalizedBattles',v_count,'contributionDamage',v_damage,
  'clearGate',jsonb_build_object('status',v_status,'ruleVersion',coalesce(v_rule.rule_version,1),
   'contributionDamage',v_damage,'minimumContributionDamage',v_min,'minimumContributionBp',v_rule.minimum_contribution_bp,
   'comparison','GTE','metric','APPLIED','maxHp',v_boss.max_hp,
   'cleared',coalesce(v_boss.outcome='DEFEAT_SUCCESS',false)));
end $function$;
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
CREATE OR REPLACE FUNCTION public.on_raid_room_clear_reward_finalized_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_room uuid;
begin
 if old.finalization_status='FINALIZED' or new.finalization_status<>'FINALIZED'
  or new.battle_mode<>'RAID' or new.resolution_authority<>'RAID_SERVER' then return new;end if;
 select id into v_room from public.raid_rooms where raid_boss_instance_id=new.source_reference_id;
 if found then perform public._issue_raid_room_clear_rewards_v1(v_room);end if;
 return new;
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
CREATE OR REPLACE FUNCTION public._raid_room_launch_enemy_snapshot_v1(p_profile jsonb, p_instance uuid, p_max_hp bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare m jsonb; e jsonb; s jsonb; c record; eq record; sk record; k text;
 stats jsonb; equipment jsonb; skills jsonb; refs jsonb; result jsonb:='[]'; categories text[];
begin
 if jsonb_array_length(p_profile->'members')<>5 or p_max_hp<=0 then raise exception 'invalid combat profile'; end if;
 if (select count(distinct x->>'characterId') from jsonb_array_elements(p_profile->'members') x)<>5 then raise exception 'duplicate raid character';end if;
 for m in select x from jsonb_array_elements(p_profile->'members') x order by (x->>'slot')::integer loop
  select * into c from public.canonical_character_master where version='2026-08-21' and character_id=m->>'characterId';
  if not found then raise exception 'raid character unavailable';end if;
  stats:=jsonb_set(m->'baseStats','{hp}',to_jsonb(ceil(p_max_hp::numeric/5)::bigint));
  equipment:='[]';skills:='[]';refs:='[]';categories:='{}';
  for e in select x from jsonb_array_elements(m->'equipment') x loop
   select * into eq from public.canonical_equipment_master where version='2026-08-21' and equipment_id=e->>'equipmentId';
   if not found then raise exception 'raid equipment unavailable';end if;
   if eq.exclusive_character_id is not null and eq.exclusive_character_id<>c.character_id then raise exception 'invalid raid equipment owner';end if;
   if eq.category=any(categories) then raise exception 'duplicate raid equipment slot';end if;
   if (e->>'level')::integer not between 1 and 100 or (e->>'plus')::integer not between 0 and 2 then raise exception 'invalid raid equipment progression';end if;
   categories:=array_append(categories,eq.category);
   foreach k in array array['hp','atk','def','spd','luk'] loop
    stats:=jsonb_set(stats,array[k],to_jsonb((stats->>k)::bigint+public.canonical_equipment_flat_stat(coalesce((eq.base_stats->>k)::integer,0),(e->>'level')::integer,(e->>'plus')::integer)));
   end loop;
   equipment:=equipment||jsonb_build_array(jsonb_build_object('equipmentId',eq.equipment_id,'name',eq.display_name,'category',eq.category,'level',(e->>'level')::integer,'plusValue',(e->>'plus')::integer));
  end loop;
  for s in select x from jsonb_array_elements(m->'skills') x loop
   select * into sk from public.canonical_skill_master where version='2026-08-21' and skill_id=s->>'skillId';
   if not found then raise exception 'raid skill unavailable';end if;
   if (s->>'plus')::integer not between 0 and 10 then raise exception 'invalid raid skill progression';end if;
   skills:=skills||jsonb_build_array(jsonb_build_object('id',sk.skill_id,'name',sk.display_name,'activationType',sk.activation_type,'cooldown',sk.cooldown,'availableFromRound',sk.available_from_round,'target',sk.target,'effects',sk.effects,'exclusiveCharacterId',sk.exclusive_character_id,'plusValue',(s->>'plus')::integer));
   refs:=refs||jsonb_build_array(sk.skill_id);
  end loop;
  if jsonb_array_length(skills) not between 1 and 5 then raise exception 'invalid raid skill count';end if;
  foreach k in array array['hp','atk','def','spd','luk'] loop
   if (stats->>k)::bigint<0 or (stats->>k)::bigint>2147483647 then raise exception 'invalid raid stat';end if;
  end loop;
  result:=result||jsonb_build_array(jsonb_build_object('id','raid_'||p_instance||'_'||(m->>'slot'),'characterId',c.character_id,'name',c.display_name,'team','ENEMY','alignment',c.attribute,'level',(m->>'level')::integer,'awakeningLevel',(m->>'awakeningLevel')::integer,'stats',stats,'equippedSkillRefs',refs,'skills',skills,'equipment',equipment));
 end loop;
 return result;
end $function$;
CREATE OR REPLACE FUNCTION public.on_raid_boss_defeated_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_room public.raid_rooms%rowtype; v_owner_name text; v_boss_name text;
begin
  if old.status='CLEARED' or new.status<>'CLEARED' or coalesce(new.current_hp,0)<>0 then
    return new;
  end if;
  select * into v_room from public.raid_rooms where raid_boss_instance_id=new.id;
  if not found then return new; end if;
  select username into v_owner_name from public.users where id=v_room.owner_user_id;
  select raid_name into v_boss_name from public.canonical_raid_variants
  where raid_variant_id=new.raid_variant_id and is_production_enabled limit 1;
  insert into public.social_activity_feed(
    activity_type,actor_user_id,actor_display_name,object_master_id,display_payload
  ) values (
    'RAID_BOSS_DEFEATED',v_room.owner_user_id,coalesce(v_owner_name,'プレイヤー'),new.id::text,
    jsonb_build_object('room_id',v_room.id,'boss_name',v_boss_name,'raid_owner_name',coalesce(v_owner_name,'プレイヤー'))
  ) on conflict do nothing;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.acknowledge_initial_raid_guide()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user_id uuid:=auth.uid(); v_legacy_enabled boolean; v_journey jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_journey:=public.get_beginner_mission_journey();
  if (v_journey->>'reflow_completed')::boolean or (v_journey->>'raid_unavailable_ack')::boolean then return true; end if;
  if not ((v_journey->'facts') @> '{"free_skill":true,"free_equipment":true,"character":true,"quest":true,"pvp":true}') then
    raise exception 'activation prerequisites not met' using errcode='55000';
  end if;
  -- get_active_raidsと同じ公開対象。既存の開催チェックを保持する。
  select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
  if v_legacy_enabled is true and exists(
    select 1 from public.raid_bosses boss
    join public.canonical_raid_boss_master master on master.boss_id=boss.boss_master_id
    where boss.status='ACTIVE' and boss.expires_at>clock_timestamp()
      and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id)
  ) then raise exception 'active raid requires participation' using errcode='55000'; end if;
  insert into public.user_funnel_milestones(user_id,milestone,metadata)
    values(v_user_id,'initial_raid_unavailable_ack',jsonb_build_object(
      'source','raid','destination','guild','reason','no_available_legacy_raid'))
    on conflict(user_id,milestone) do nothing;
  return true;
end;
$function$;
CREATE OR REPLACE FUNCTION public.capture_quest_raid_encounter_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_area text;
begin
 if new.status is distinct from 'COMPLETED' or old.status='COMPLETED'
   or new.battle_result is distinct from 'VICTORY' or not coalesce(new.battle_resolved,false)
   or not coalesce(new.has_battle_event,false) then return new; end if;
 if not exists(select 1 from public.quest_raid_encounter_settings where singleton and enabled)
   or not exists(select 1 from public.tutorial_progress where user_id=new.user_id and step_id='COMPLETE') then return new;end if;
 select public.quest_town_key(town_id) into v_area from public.canonical_quest_master
  where version='2026-08-30' and quest_id=coalesce(new.course_id,new.quest_id) and is_production_enabled;
 if v_area is not null then
  insert into public.quest_raid_encounters(patrol_id,user_id,area_id) values(new.id,new.user_id,v_area) on conflict do nothing;
 end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public.quest_raid_encounter_projection_v1(p_patrol_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select jsonb_build_object('patrolId',e.patrol_id,'status',e.status,'roomId',e.room_id,'areaId',e.area_id,
 'difficulty',e.difficulty,'bossName',v.raid_name,'leaderId',v.member_character_ids->>0,
 'rewardMultiplier',1,'bonusCash',coalesce(e.bonus_cash,(public._quest_raid_cash_xp_v2(e.patrol_id)->>'cash')::bigint),'bonusUserXp',coalesce(e.bonus_user_xp,(public._quest_raid_cash_xp_v2(e.patrol_id)->>'userXp')::integer),'bonusItems','[]'::jsonb,'acknowledged',e.acknowledged_at is not null,
 'expiresAt',b.expires_at,'ended',b.id is not null and (b.status<>'ACTIVE' or b.current_hp<=0 or b.expires_at<=now() or b.outcome_finalized_at is not null))
 from public.quest_raid_encounters e left join public.canonical_raid_variants v on v.raid_variant_id=e.variant_id
 left join public.raid_rooms r on r.id=e.room_id left join public.raid_bosses b on b.id=r.raid_boss_instance_id
 where e.patrol_id=p_patrol_id
$function$;
CREATE OR REPLACE FUNCTION public.get_quest_raid_encounters_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(public.quest_raid_encounter_projection_v1(patrol_id) order by created_at) from public.quest_raid_encounters
 where user_id=auth.uid() and status<>'NO_ENCOUNTER' and (acknowledged_at is null or exists(select 1 from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id where r.id=room_id and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now()))),'[]'::jsonb);
end $function$;
CREATE OR REPLACE FUNCTION public.get_quest_raid_bonus_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare e public.quest_raid_encounters%rowtype; amounts jsonb; receipt public.quest_raid_encounter_bonus_grants%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 perform public.get_raid_room_v1(p_room_id);
 select * into e from public.quest_raid_encounters where room_id=p_room_id and status='CREATED';
 if not found then return null;end if;
 amounts:=public._quest_raid_cash_xp_v2(e.patrol_id);
 select * into receipt from public.quest_raid_encounter_bonus_grants where room_id=p_room_id and user_id=auth.uid();
 return jsonb_build_object('roomId',p_room_id,'rewardMultiplier',1,'items','[]'::jsonb,'delivery','DIRECT',
 'cash',coalesce(receipt.cash,e.bonus_cash,(amounts->>'cash')::bigint),
 'userXp',coalesce(receipt.user_xp,e.bonus_user_xp,(amounts->>'userXp')::integer),
 'issued',receipt.room_id is not null,'legacyIssued',receipt.room_id is not null and receipt.cash is null);
end $function$;
CREATE OR REPLACE FUNCTION public.issue_quest_raid_encounter_bonus_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare e public.quest_raid_encounters%rowtype; amounts jsonb; v_cash bigint; v_xp integer; inserted integer;
begin
 -- 救援成功だけでは付与しない。正式撃破受給ledgerを単一入口にする。
 if tg_table_name<>'raid_room_clear_rewards' then return new;end if;
 select * into e from public.quest_raid_encounters where room_id=new.room_id and status='CREATED';
 if not found then return new;end if;
 amounts:=public._quest_raid_cash_xp_v2(e.patrol_id);
 v_cash:=coalesce(e.bonus_cash,(amounts->>'cash')::bigint);
 v_xp:=coalesce(e.bonus_user_xp,(amounts->>'userXp')::integer);
 if v_cash is null or v_xp is null then raise exception 'quest bonus authority missing';end if;
 insert into public.quest_raid_encounter_bonus_grants(room_id,user_id,rule_version,cash,user_xp)
 values(new.room_id,new.user_id,3,v_cash,v_xp) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return new;end if;
 if v_cash>0 then update public.users set cash=cash+v_cash where id=new.user_id;end if;
 if v_xp>0 then perform public.apply_user_xp(new.user_id,v_xp);end if;
 return new;
end $function$;
CREATE OR REPLACE FUNCTION public._issue_raid_daily_clear_bonus_v2(p_room_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_reward_policy_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 return (select jsonb_agg(jsonb_build_object(
 'difficulty',r.difficulty,'enabled',r.enabled and r.minimum_contribution_damage is not null,
 'status',case when r.enabled and r.minimum_contribution_damage is not null then 'ACTIVE' else 'PENDING_CONTRIBUTION' end,
 'version',r.rule_version,
 'eligibility',jsonb_build_object('minimumBattles',1,'minimumContributionBp',r.minimum_contribution_bp,'metric','APPLIED','comparison','GTE'),
 'strategyVersion',case when (select count(*) from public.raid_room_combat_profiles p where p.difficulty_id=r.difficulty and p.profile->>'strategyVersion'='2026-09-14')=7 then '2026-09-14' else null end,
 'instanceItems',(select jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) from public.raid_room_clear_reward_items i where i.difficulty=r.difficulty),
 'daily',jsonb_build_object('chanceBp',d.chance_bp,'items',d.items)
 ) order by r.difficulty) from public.raid_room_clear_reward_rules r join public.raid_daily_clear_bonus_rules d using(difficulty));
end $function$;
CREATE OR REPLACE FUNCTION private.raid_top_snapshot_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_daily jsonb;
  v_result jsonb;
begin
  if v_uid is null or not exists(select 1 from public.users where id = v_uid) then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  -- 日次の遅延確定以外に書込を発生させない。失敗は例外のまま返す。
  v_daily := private.raid_daily_targets_v1();
  -- 日次ロック待機中の期限到達も反映する。
  v_now := clock_timestamp();
  with
  participating_page as materialized (
    select r.id, r.created_at
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.status = 'ACTIVE' and b.current_hp > 0 and b.expires_at > v_now
      and b.outcome_finalized_at is null
      and (r.owner_user_id = v_uid or exists (
        select 1 from public.raid_room_members m where m.room_id = r.id and m.user_id = v_uid
      ))
    order by r.created_at desc, r.id desc limit 20
  ),
  visible_rescues as (
    select p.*, row_number() over (
      partition by p.room_id order by p.created_at desc, p.id desc
    ) as publication_number
    from public.raid_room_rescue_publications p
    join public.raid_rooms r on r.id = p.room_id
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.status = 'ACTIVE' and b.current_hp > 0 and b.expires_at > v_now
      and b.outcome_finalized_at is null
      -- get_raid_room_rescue_v1 と同じ現在所属判定。移籍前Guildを認めない。
      and (p.channel = 'ACTIVITY' or (p.channel = 'GUILD' and exists (
        select 1 from public.guild_members gm
        where gm.user_id = v_uid and gm.guild_id = p.guild_id
      )))
  ),
  rescue_page as materialized (
    select * from visible_rescues where publication_number = 1
    order by created_at desc, id desc limit 20
  ),
  selected_ids as materialized (
    select id from participating_page union select room_id from rescue_page
  ),
  selected_rooms as materialized (
    select r.*, b.raid_variant_id, b.max_hp, b.current_hp, b.expires_at, b.outcome_finalized_at
    from selected_ids s join public.raid_rooms r on r.id = s.id
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
  ),
  registered as materialized (
    -- 登録参加人数。オンライン数や戦績ログ件数ではない。主催者を重複排除する。
    select r.id as room_id, r.owner_user_id as user_id from selected_rooms r
    union
    select m.room_id, m.user_id from public.raid_room_members m
    join selected_ids s on s.id = m.room_id
  ),
  member_numbers as materialized (
    select m.*, count(*) over(partition by m.room_id) as registered_count,
      row_number() over(partition by m.room_id order by (m.user_id = r.owner_user_id) desc, m.user_id) as face_number
    from registered m join selected_rooms r on r.id = m.room_id
  ),
  profile_ids as materialized (
    select owner_user_id as user_id from selected_rooms
    union select user_id from member_numbers where face_number <= 5
  ),
  profiles as materialized (
    select u.id, jsonb_build_object(
      'userId', u.id, 'name', u.username,
      'leaderIconUrl', jsonb_build_object('status', 'unknown'),
      -- 画像URLはクライアントの現行キャラクターマスターで解決する。
      -- avatar_urlは任意プロフィール画像であり、リーダーの代用にしない。
      'leaderCharacterId', jsonb_build_object('status', 'available', 'value', u.favorite_character_id)
    ) as dto
    from profile_ids p join public.users u on u.id = p.user_id
  ),
  member_summaries as (
    select m.room_id, max(m.registered_count) as registered_count,
      jsonb_agg(p.dto order by m.face_number) filter(where m.face_number <= 5) as faces
    from member_numbers m join profiles p on p.id = m.user_id
    where m.face_number <= 5
    group by m.room_id
  ),
  projected as materialized (
    select r.id, jsonb_build_object(
      'room', jsonb_build_object(
        'roomId', r.id, 'difficultyId', r.difficulty_id,
        'owner', jsonb_build_object('status', 'available', 'value', owner.dto),
        'state', jsonb_build_object('status', 'available', 'value', 'active'),
        'createdAt', jsonb_build_object('status', 'available', 'value', r.created_at),
        'expiresAt', jsonb_build_object('status', 'available', 'value', r.expires_at),
        'endedAt', jsonb_build_object('status', 'available', 'value', r.outcome_finalized_at),
        'hp', case when r.max_hp is not null and r.current_hp is not null then
          jsonb_build_object('status', 'available', 'value', jsonb_build_object('current', r.current_hp, 'max', r.max_hp))
          else jsonb_build_object('status', 'unknown') end,
        'participantCount', jsonb_build_object('status', 'available', 'value', members.registered_count),
        'serverEligibility', jsonb_build_object('status', 'unknown')
      ),
      'enemy', case when r.raid_variant_id is null then jsonb_build_object('status', 'unknown')
        else jsonb_build_object('status', 'available', 'value', jsonb_build_object('variantId', r.raid_variant_id)) end,
      'ownerGuild', case when gm.guild_id is not null and g.id is null then jsonb_build_object('status', 'unknown')
        else jsonb_build_object('status', 'available', 'value', case when g.id is null then null
          else jsonb_build_object('guildId', g.id, 'name', g.name) end) end,
      'participants', jsonb_build_object('status', 'available', 'value', coalesce(members.faces, '[]'::jsonb)),
      'membership', jsonb_build_object('status', 'available', 'value', case
        when r.owner_user_id = v_uid then 'owner'
        when rescue_member.user_id is not null then 'rescue'
        when my_member.user_id is not null then 'member'
        else 'not_joined' end),
      'rescue', jsonb_build_object('status', 'unknown')
    ) as dto
    from selected_rooms r
    join profiles owner on owner.id = r.owner_user_id
    join member_summaries members on members.room_id = r.id
    left join public.guild_members gm on gm.user_id = r.owner_user_id
    left join public.guilds g on g.id = gm.guild_id
    left join public.raid_room_members my_member on my_member.room_id = r.id and my_member.user_id = v_uid
    left join public.raid_room_rescue_members rescue_member on rescue_member.room_id = r.id and rescue_member.user_id = v_uid
  )
  select jsonb_build_object(
    'participating', jsonb_build_object('status', 'ready', 'data', coalesce((
      select jsonb_agg(p.dto order by page.created_at desc, page.id desc)
      from participating_page page join projected p on p.id = page.id
    ), '[]'::jsonb)),
    'rescues', jsonb_build_object('status', 'ready', 'data', coalesce((
      select jsonb_agg(p.dto || jsonb_build_object('rescue', jsonb_build_object('status', 'available', 'value',
        jsonb_build_object('rescueId', page.id,
          'source', case page.channel when 'ACTIVITY' then 'activity' else 'guild_chat' end,
          'scope', page.channel, 'guildId', page.guild_id)
      )) order by page.created_at desc, page.id desc)
      from rescue_page page join projected p on p.id = page.room_id
    ), '[]'::jsonb)),
    'dailyTargets', jsonb_build_object('status', 'ready', 'data', v_daily)
  ) into v_result;
  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION private.raid_room_display_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_uid uuid:=auth.uid(); v_room public.raid_rooms%rowtype;
 v_joined boolean; v_member text; v_leaders jsonb; v_guild jsonb;
 v_clear jsonb; v_rescue jsonb;
begin
 if v_uid is null or not exists(select 1 from public.users where id=v_uid) then
  raise exception 'authentication required' using errcode='42501'; end if;
 select * into v_room from public.raid_rooms where id=p_room_id;
 if not found or not public.raid_room_can_read_v1(p_room_id) then
  raise exception 'room unavailable' using errcode='P0002'; end if;
 v_joined:=v_room.owner_user_id=v_uid or exists(select 1 from public.raid_room_members where room_id=p_room_id and user_id=v_uid)
  or exists(select 1 from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and user_id=v_uid and finalized_battles>0);
 v_member:=case when v_room.owner_user_id=v_uid then 'owner'
  when exists(select 1 from public.raid_room_rescue_members where room_id=p_room_id and user_id=v_uid) then 'rescue'
  when v_joined then 'member' else 'not_joined' end;
 -- Same participant privacy as SQL255. An outsider receives the public owner only.
 with members as (
  select v_room.owner_user_id as user_id
  union select user_id from public.raid_room_members where room_id=p_room_id and v_joined
  union select user_id from public.raid_instance_user_progress where raid_boss_instance_id=v_room.raid_boss_instance_id and finalized_battles>0 and v_joined
 ), page as (select user_id from members order by user_id limit 20), ids as (
  select user_id from page union select v_room.owner_user_id
 ) select coalesce(jsonb_object_agg(u.id::text,u.favorite_character_id),'{}'::jsonb) into v_leaders
 from ids join public.users u on u.id=ids.user_id;
 select case when m.guild_id is not null and g.id is null then jsonb_build_object('status','unknown')
  else jsonb_build_object('status','available','value',case when g.id is null then null
   else jsonb_build_object('guildId',g.id,'name',g.name) end) end into v_guild
 from (select v_room.owner_user_id as id) owner
 left join public.guild_members m on m.user_id=owner.id left join public.guilds g on g.id=m.guild_id;
 -- Plans are read from current configuration, never copied into the issued Present collection.
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,
  'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_clear from public.raid_room_clear_reward_rules r left join public.raid_room_clear_reward_items i on i.difficulty=r.difficulty
 where r.difficulty=v_room.difficulty_id group by r.enabled;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,
  'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_rescue from public.raid_room_rescue_reward_rules r left join public.raid_room_rescue_reward_items i on i.difficulty=r.difficulty
 where r.difficulty=v_room.difficulty_id group by r.enabled;
 return jsonb_build_object('roomId',p_room_id,'ownerGuild',v_guild,'leaderCharacterIds',v_leaders,'membership',v_member,
  'clearPlan',coalesce(v_clear,'{"status":"unconfigured","items":[]}'::jsonb),
  'rescuePlan',coalesce(v_rescue,'{"status":"unconfigured","items":[]}'::jsonb));
end $function$;
CREATE OR REPLACE FUNCTION private.raid_page_entry_v1(p_room_id uuid, p_rescue_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select jsonb_build_object(
  'room',jsonb_set(public.raid_room_projection_v1(r.id),'{owner,value,leaderCharacterId}',jsonb_build_object('status','available','value',u.favorite_character_id)),
  'enemy',case when b.raid_variant_id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',jsonb_build_object('variantId',b.raid_variant_id)) end,
  'ownerGuild',case when gm.guild_id is not null and g.id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',case when g.id is null then null else jsonb_build_object('guildId',g.id,'name',g.name) end) end,
  'participants',jsonb_build_object('status','unknown'),
  'membership',jsonb_build_object('status','available','value',case when r.owner_user_id=auth.uid() then 'owner'
   when exists(select 1 from public.raid_room_rescue_members where room_id=r.id and user_id=auth.uid()) then 'rescue'
   when exists(select 1 from public.raid_room_members where room_id=r.id and user_id=auth.uid()) then 'member' else 'not_joined' end),
  'rescue',case when p.id is null then jsonb_build_object('status','unknown') else jsonb_build_object('status','available','value',jsonb_build_object('rescueId',p.id,'source',case when p.channel='GUILD' then 'guild_chat' else 'activity' end,'scope',p.channel,'guildId',p.guild_id)) end)
 from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
 join public.users u on u.id=r.owner_user_id left join public.guild_members gm on gm.user_id=u.id left join public.guilds g on g.id=gm.guild_id
 left join public.raid_room_rescue_publications p on p.id=p_rescue_id and p.room_id=r.id where r.id=p_room_id
$function$;
CREATE OR REPLACE FUNCTION private.raid_browse_page_v1(p_difficulty_id text, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_rows jsonb; v_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_difficulty_id is null or p_difficulty_id not in ('beginner','intermediate','advanced','expert') or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'invalid page' using errcode='22023'; end if;
 with page as (select r.id,r.created_at from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where r.difficulty_id=p_difficulty_id and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>statement_timestamp() and b.outcome_finalized_at is null
   and public.raid_room_can_read_v1(r.id) order by r.created_at desc,r.id limit 21 offset p_offset),
 numbered as(select *,row_number() over(order by created_at desc,id) n from page)
 select coalesce(jsonb_agg(private.raid_page_entry_v1(id) order by created_at desc,id) filter(where n<=20),'[]'::jsonb),count(*) into v_rows,v_count from numbered;
 return jsonb_build_object('entries',v_rows,'nextOffset',case when v_count>20 then p_offset+20 else null end);
end $function$;
CREATE OR REPLACE FUNCTION private.raid_rescue_cards_v1(p_rescue_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_rows jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_rescue_ids is null or cardinality(p_rescue_ids)>50 then raise exception 'invalid page' using errcode='22023'; end if;
 -- Ended raids remain visible on already-published links; current Guild membership still gates visibility.
 select coalesce(jsonb_agg(private.raid_page_entry_v1(p.room_id,p.id) order by p.id),'[]'::jsonb) into v_rows
 from public.raid_room_rescue_publications p where p.id=any(p_rescue_ids)
  and (p.channel='ACTIVITY' or (p.channel='GUILD' and exists(select 1 from public.guild_members where user_id=auth.uid() and guild_id=p.guild_id)))
  and public.raid_room_can_read_v1(p.room_id);
 return jsonb_build_object('entries',v_rows);
end $function$;
CREATE OR REPLACE FUNCTION private.raid_enemy_info_v1(p_variant_id text, p_difficulty_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_members jsonb; v_member text; v_refs jsonb; v_skills jsonb; v_map jsonb:='{}'; v_clear jsonb; v_rescue jsonb; v_launch jsonb; v_unit jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_difficulty_id is null or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then raise exception 'invalid difficulty' using errcode='22023'; end if;
 select profile into v_launch from public.raid_room_combat_profiles where raid_variant_id=p_variant_id and difficulty_id=p_difficulty_id;
 if found then
 select jsonb_agg(x->>'characterId' order by (x->>'slot')::integer) into v_members from jsonb_array_elements(v_launch->'members') x;
 else
 select member_character_ids into v_members from public.canonical_raid_variants where raid_variant_id=p_variant_id;
 end if;
 if v_members is null or jsonb_array_length(v_members)<>5 then raise exception 'enemy unavailable' using errcode='P0002'; end if;
 for v_member in select value from jsonb_array_elements_text(v_members) loop
  -- Match start_raid_room_battle_v1 (SQL260) exactly: HARD entry override, exclusive, then regular skills.
  if v_launch is not null then
   select x into v_unit from jsonb_array_elements(v_launch->'members') x where x->>'characterId'=v_member;
   select jsonb_agg(x->>'skillId' order by n) into v_refs from jsonb_array_elements(v_unit->'skills') with ordinality e(x,n);
  else
  select coalesce((select skill_loadout from public.canonical_quest_enemy_pool_entries where version='2026-08-30' and character_id=v_member and difficulty='HARD' order by local_affinity desc,weight desc limit 1),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id=v_member order by skill_id limit 2)s),
   (select jsonb_agg(skill_id order by skill_id) from(select skill_id from public.canonical_skill_master where version='2026-08-21' and exclusive_character_id is null order by skill_id limit 2)s),'[]'::jsonb) into v_refs;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.skill_id,'name',s.display_name) order by x.ordinality),'[]'::jsonb) into v_skills
   from jsonb_array_elements_text(v_refs) with ordinality x(id,ordinality) join public.canonical_skill_master s on s.version='2026-08-21' and s.skill_id=x.id;
  if jsonb_array_length(v_refs)<>jsonb_array_length(v_skills) then raise exception 'enemy skills unavailable' using errcode='P0002'; end if;
  v_map:=v_map||jsonb_build_object(v_member,v_skills);
 end loop;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_clear from public.raid_room_clear_reward_rules r left join public.raid_room_clear_reward_items i on i.difficulty=r.difficulty where r.difficulty=p_difficulty_id group by r.enabled;
 select jsonb_build_object('status',case when r.enabled and count(i.item_id)>0 then 'configured' else 'unconfigured' end,'items',case when r.enabled then coalesce(jsonb_agg(jsonb_build_object('itemId',i.item_id,'quantity',i.quantity) order by i.item_id) filter(where i.item_id is not null),'[]'::jsonb) else '[]'::jsonb end)
 into v_rescue from public.raid_room_rescue_reward_rules r left join public.raid_room_rescue_reward_items i on i.difficulty=r.difficulty where r.difficulty=p_difficulty_id group by r.enabled;
 return jsonb_build_object('variantId',p_variant_id,'memberCharacterIds',v_members,'skillsByCharacterId',v_map,'clearPlan',coalesce(v_clear,'{"status":"unconfigured","items":[]}'),'rescuePlan',coalesce(v_rescue,'{"status":"unconfigured","items":[]}'));
end $function$;
CREATE OR REPLACE FUNCTION public.list_raid_room_boss_choices_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_daily jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 v_daily := private.raid_daily_targets_v1();
 return jsonb_build_object('choices',coalesce((select jsonb_agg(
  jsonb_build_object('raidVariantId',v.raid_variant_id,'name',v.raid_name) order by v.raid_variant_id)
  from public.canonical_raid_variants v where v.is_production_enabled and exists (
   select 1 from jsonb_array_elements(v_daily->'targets') t where t->>'variantId'=v.raid_variant_id
  )),'[]'::jsonb));
end $function$;
CREATE OR REPLACE FUNCTION public.create_raid_room_v1(p_difficulty_id text, p_raid_variant_id text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 v_uid uuid := auth.uid();
 v_level integer;
 v_enabled boolean;
 v_power bigint;
 v_gate jsonb;
 v_rule public.raid_room_lifecycle_rules%rowtype;
 v_variant public.canonical_raid_variants%rowtype;
 v_request public.raid_room_creation_requests%rowtype;
 v_instance uuid;
 v_room uuid;
 v_now timestamptz;
 v_daily jsonb;
 v_launch jsonb;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if current_setting('transaction_isolation') <> 'read committed' then
   raise exception 'read committed required' using errcode='25001';
 end if;
 if p_request_id is null or p_difficulty_id is null or p_raid_variant_id is null
   or p_difficulty_id not in ('beginner','intermediate','advanced','expert') then
   raise exception 'invalid creation input' using errcode='22023';
 end if;
 -- 設定無効時は再送も拒否する。作成済みRoomの参照は既存参照RPCを使う。
 select enabled into v_enabled from public.raid_room_creation_settings where singleton for share;
 if v_enabled is distinct from true then
   raise exception 'room creation disabled' using errcode='55000';
 end if;
 -- ユーザー単位で異なる難度を含む再送を直列化。全生成経路のロック順を揃える。
 select level into v_level from public.users where id=v_uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501'; end if;
 select * into v_request from public.raid_room_creation_requests where user_id=v_uid and request_id=p_request_id;
 if found then
   if v_request.difficulty_id<>p_difficulty_id or v_request.raid_variant_id<>p_raid_variant_id then
     raise exception 'request payload conflict' using errcode='22023';
   end if;
   return public.raid_room_projection_v1(v_request.room_id);
 end if;
 if v_level is null or v_level<5 then raise exception 'raid level requirement' using errcode='42501'; end if;
 -- 難度枠を先にロックし、待機後に総合力と生成時刻を取得する。
 select * into v_rule from public.raid_room_lifecycle_rules where difficulty=p_difficulty_id for update;
 if not found then raise exception 'lifecycle rule unavailable' using errcode='22023'; end if;
 -- 空編成を既存集計関数のcoalesceで0として判定しない。初級には総合力制限がない。
 if p_difficulty_id<>'beginner' and not exists(
   select 1 from public.user_main_formations where user_id=v_uid
 ) then raise exception 'power unavailable' using errcode='42501'; end if;
 v_power := public.calculate_user_total_power(v_uid);
 if p_difficulty_id<>'beginner' and (v_power is null or v_power<0) then
   raise exception 'power unavailable' using errcode='42501';
 end if;
 v_gate := public._raid_room_power_gate_v1(p_difficulty_id,v_power);
 if v_gate->>'status' is distinct from 'passed' then
   raise exception 'raid power requirement' using errcode='42501';
 end if;
 select * into v_variant from public.canonical_raid_variants
   where raid_variant_id=p_raid_variant_id and is_production_enabled;
 if not found or v_variant.max_hp is null or v_variant.max_hp<=0 then
   raise exception 'raid variant unavailable' using errcode='22023';
 end if;
 select profile into v_launch from public.raid_room_combat_profiles
 where raid_variant_id=p_raid_variant_id and difficulty_id=p_difficulty_id;
 if not found then raise exception 'raid launch profile unavailable' using errcode='55000'; end if;
 v_variant.max_hp := (v_launch->>'maxHp')::bigint;
 -- Successful same-request receipts above are returned before any new-day target check.
 loop
  v_daily := private.raid_daily_targets_v1();
  v_now := clock_timestamp();
  exit when v_daily->>'dateJst' = ((v_now at time zone 'Asia/Tokyo')::date)::text;
 end loop;
 if not exists(select 1 from jsonb_array_elements(v_daily->'targets') t where t->>'variantId'=p_raid_variant_id) then
  raise exception 'raid variant outside daily targets' using errcode='22023';
 end if;
 v_instance := gen_random_uuid();
 -- 日次グループとの識別のみ。旧writerを遮断するものではないため設定は無効で出荷。
 insert into public.raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,base_id,status,
   spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_instance,v_variant.raid_variant_id,v_variant.raid_variant_id,v_variant.max_hp,v_variant.max_hp,
   lower(v_variant.area_id),'ACTIVE',v_now,v_now+make_interval(hours=>v_rule.duration_hours),
   gen_random_uuid(),(v_now at time zone 'Asia/Tokyo')::date,v_variant.raid_variant_id,'ROOM:'||v_instance::text);
 v_room := (public._raid_room_register_v1(v_instance,v_uid,p_difficulty_id)->>'roomId')::uuid;
 insert into public.raid_room_combat_snapshots(room_id,profile,enemy_snapshot)
 values(v_room,v_launch,public._raid_room_launch_enemy_snapshot_v1(v_launch,v_instance,v_variant.max_hp));
 insert into public.raid_room_creation_requests(user_id,request_id,difficulty_id,raid_variant_id,room_id)
 values(v_uid,p_request_id,p_difficulty_id,p_raid_variant_id,v_room);
 -- Room登録・所有者参加・再送台帳まで同一transaction。資源消費や戦闘開始は行わない。
 return public.raid_room_projection_v1(v_room);
end $function$;
CREATE OR REPLACE FUNCTION public.get_raid_room_display_v1(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$select private.raid_room_display_v1(p_room_id)$function$;
CREATE OR REPLACE FUNCTION public.list_raid_room_cards_v1(p_difficulty_id text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$select private.raid_browse_page_v1(p_difficulty_id,p_offset)$function$;
CREATE OR REPLACE FUNCTION public.ensure_daily_raid_rooms_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_system_owner constant uuid := '00000000-0000-0000-0000-524149445359'::uuid;
  v_day date;
  v_now timestamptz;
  v_target record;
  v_variant public.canonical_raid_variants%rowtype;
  v_rule public.raid_room_lifecycle_rules%rowtype;
  v_instance_id uuid;
  v_room_id uuid;
  v_was_existing boolean;
  v_created integer := 0;
  v_existing integer := 0;
  v_rooms jsonb := '[]'::jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'read committed required' using errcode = '25001';
  end if;

  -- private.raid_daily_targets_v1() intentionally requires an authenticated
  -- context. The fixed internal owner is only used as that scheduler identity.
  perform set_config('request.jwt.claim.sub', v_system_owner::text, true);
  v_day := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  perform pg_advisory_xact_lock(
    hashtextextended('raid_daily_room_generation:' || v_day::text, 0)
  );

  -- Resolve/initialize today's two-target authority once, then freeze the day.
  -- Recheck across midnight so a boundary during the first call cannot leave
  -- the scheduler with a stale date and zero targets.
  loop
    v_day := (clock_timestamp() at time zone 'Asia/Tokyo')::date;
    perform private.raid_daily_targets_v1();
    exit when v_day = (clock_timestamp() at time zone 'Asia/Tokyo')::date;
  end loop;

  select * into v_rule
  from public.raid_room_lifecycle_rules
  where difficulty = 'beginner'
  for update;
  if not found then
    raise exception 'beginner lifecycle rule unavailable' using errcode = '55000';
  end if;

  for v_target in
    select date_jst, first_variant_id as variant_id
    from private.raid_daily_targets
    where date_jst = v_day
    union all
    select date_jst, second_variant_id
    from private.raid_daily_targets
    where date_jst = v_day
  loop
    select * into v_variant
    from public.canonical_raid_variants
    where raid_variant_id = v_target.variant_id
      and is_production_enabled
    for share;
    if not found or v_variant.max_hp is null or v_variant.max_hp <= 0 then
      raise exception 'daily raid variant unavailable: %', v_target.variant_id
        using errcode = '55000';
    end if;

    v_now := clock_timestamp();
    select r.id into v_room_id
    from public.raid_rooms r
    join public.raid_bosses b on b.id = r.raid_boss_instance_id
    where b.rotation_date = v_day
      and b.raid_variant_id = v_target.variant_id
      and r.difficulty_id = 'beginner'
      and b.status = 'ACTIVE'
      and b.current_hp > 0
      and b.expires_at > v_now
      and b.outcome_finalized_at is null
    order by r.created_at, r.id
    limit 1;

    if found then
      v_was_existing := true;
      v_existing := v_existing + 1;
    else
      v_was_existing := false;
      if (
        select count(*)
        from public.raid_rooms r
        join public.raid_bosses b on b.id = r.raid_boss_instance_id
        where r.difficulty_id = 'beginner'
          and b.status = 'ACTIVE'
          and b.current_hp > 0
          and b.expires_at > v_now
          and b.outcome_finalized_at is null
      ) >= v_rule.max_active_rooms then
        raise exception 'active beginner room limit reached' using errcode = '55000';
      end if;

      v_instance_id := gen_random_uuid();
      insert into public.raid_bosses(
        id, boss_id, boss_master_id, current_hp, max_hp, base_id, status,
        spawned_at, expires_at, cycle_id, rotation_date, raid_variant_id, raid_day_key
      ) values (
        v_instance_id,
        v_variant.raid_variant_id,
        v_variant.raid_variant_id,
        v_variant.max_hp,
        v_variant.max_hp,
        lower(v_variant.area_id),
        'ACTIVE',
        v_now,
        v_now + make_interval(hours => v_rule.duration_hours),
        gen_random_uuid(),
        v_day,
        v_variant.raid_variant_id,
        'DAILY:' || v_day::text || ':' || v_variant.raid_variant_id
      );

      v_room_id := gen_random_uuid();
      insert into public.raid_rooms(
        id, raid_boss_instance_id, owner_user_id, difficulty_id, created_at
      ) values (
        v_room_id, v_instance_id, v_system_owner, 'beginner', v_now
      );
      insert into public.raid_room_members(room_id, user_id, joined_at)
      values (v_room_id, v_system_owner, v_now);
      v_created := v_created + 1;
    end if;

    v_rooms := v_rooms || jsonb_build_array(jsonb_build_object(
      'dateJst', v_day,
      'variantId', v_target.variant_id,
      'roomId', v_room_id,
      'created', not v_was_existing
    ));
  end loop;

  return jsonb_build_object(
    'dateJst', v_day,
    'created', v_created,
    'existing', v_existing,
    'rooms', v_rooms
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.resolve_quest_raid_encounter_v1(p_patrol_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
 uid uuid:=auth.uid(); e public.quest_raid_encounters%rowtype; cfg public.quest_raid_encounter_settings%rowtype;
 progress public.quest_raid_encounter_progress%rowtype; variant public.canonical_raid_variants%rowtype;
 rule public.raid_room_lifecycle_rules%rowtype; power bigint; lvl integer; options jsonb:='[]'; opt jsonb;
 total_weight integer:=0; draw integer; instance_id uuid; new_room uuid; created_time timestamptz; bonus jsonb; active_count integer; launch_profile jsonb;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'read committed required' using errcode='25001';end if;
 -- Same lock order as manual creation. Claims do not lock Encounter progress.
 select level into lvl from public.users where id=uid for no key update;
 if not found then raise exception 'user unavailable' using errcode='42501';end if;
 select * into e from public.quest_raid_encounters where patrol_id=p_patrol_id and user_id=uid for update;
 if not found then return jsonb_build_object('status','NO_ENCOUNTER','patrolId',p_patrol_id);end if;
 if e.status in ('CREATED','NO_ENCOUNTER') then return public.quest_raid_encounter_projection_v1(p_patrol_id);end if;
 select * into cfg from public.quest_raid_encounter_settings where singleton for share;
 if not cfg.enabled or not exists(select 1 from public.raid_room_creation_settings where singleton and enabled) or lvl<5 then
  return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
 end if;
 select count(*) into active_count from public.quest_raid_encounters x join public.raid_rooms r on r.id=x.room_id
 join public.raid_bosses b on b.id=r.raid_boss_instance_id where x.user_id=uid and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now() and b.outcome_finalized_at is null;
 if active_count>=cfg.personal_active_limit then
  if e.status='PENDING' then update public.quest_raid_encounters set status='NO_ENCOUNTER' where patrol_id=p_patrol_id;end if;
  return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
 end if;
 power:=public.calculate_user_total_power(uid);
 insert into public.quest_raid_encounter_progress(user_id) values(uid) on conflict do nothing;
 select * into progress from public.quest_raid_encounter_progress where user_id=uid for update;
 if e.status='PENDING' then
  select * into variant from public.canonical_raid_variants where lower(area_id)=e.area_id and is_production_enabled order by raid_variant_id limit 1;
  if not found then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
  if not cfg.allow_outside_daily and not exists(select 1 from jsonb_array_elements(private.raid_daily_targets_v1()->'targets') t where t->>'variantId'=variant.raid_variant_id) then
   return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
  end if;
  for opt in select jsonb_build_object('difficulty',d,'weight',w) from (values ('beginner',cfg.beginner_weight),('intermediate',cfg.intermediate_weight),('advanced',cfg.advanced_weight)) a(d,w) where w>0 loop
   if (public._raid_room_power_gate_v1(opt->>'difficulty',power)->>'status')='passed' then
    options:=options||jsonb_build_array(opt);total_weight:=total_weight+(opt->>'weight')::integer;
   end if;
  end loop;
  if total_weight=0 then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
  draw:=floor(random()*total_weight)::integer;
  for opt in select * from jsonb_array_elements(options) loop
   draw:=draw-(opt->>'weight')::integer;
   if draw<0 then e.difficulty:=opt->>'difficulty';exit;end if;
  end loop;
  -- Capacity is checked before the occurrence roll so cap failures do not consume the guarantee.
  select * into rule from public.raid_room_lifecycle_rules where difficulty=e.difficulty for update;
  select count(*) into active_count from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
   where r.difficulty_id=e.difficulty and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now() and b.outcome_finalized_at is null;
  if active_count>=rule.max_active_rooms then
   update public.quest_raid_encounters set status='NO_ENCOUNTER' where patrol_id=p_patrol_id;
   return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);
  end if;
  if progress.misses<cfg.guaranteed_after-1 and floor(random()*10000)>=cfg.probability_bp then
   update public.quest_raid_encounters set status='NO_ENCOUNTER',rule_version=cfg.version where patrol_id=p_patrol_id;
   update public.quest_raid_encounter_progress set misses=misses+1 where user_id=uid;
   return public.quest_raid_encounter_projection_v1(p_patrol_id);
  end if;
  bonus:='[]'::jsonb;
  update public.quest_raid_encounters set status='DRAWN',difficulty=e.difficulty,variant_id=variant.raid_variant_id,rule_version=cfg.version,bonus_items='[]'::jsonb,reward_multiplier=1,bonus_cash=(public._quest_raid_cash_xp_v2(p_patrol_id)->>'cash')::bigint,bonus_user_xp=(public._quest_raid_cash_xp_v2(p_patrol_id)->>'userXp')::integer where patrol_id=p_patrol_id returning * into e;
 end if;
 -- Once drawn, retry the same difficulty/Boss. Never reroll a failed creation.
 select * into variant from public.canonical_raid_variants where raid_variant_id=e.variant_id and is_production_enabled;
 if not found or (public._raid_room_power_gate_v1(e.difficulty,power)->>'status') is distinct from 'passed' then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
 select * into rule from public.raid_room_lifecycle_rules where difficulty=e.difficulty for update;
 select count(*) into active_count from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id
  where r.difficulty_id=e.difficulty and b.status='ACTIVE' and b.current_hp>0 and b.expires_at>now() and b.outcome_finalized_at is null;
 if active_count>=rule.max_active_rooms then return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id);end if;
 -- Registration, lifecycle, battle and membership remain the existing Raid authority.
 begin
  -- Same difficulty-specific profile and HP authority as create_raid_room_v1.
  -- Missing/invalid profile leaves DRAWN retryable; no partial Boss/Room can survive.
  select profile into launch_profile from public.raid_room_combat_profiles
   where raid_variant_id=e.variant_id and difficulty_id=e.difficulty;
  if not found then raise exception 'raid launch profile unavailable' using errcode='55000';end if;
  variant.max_hp:=(launch_profile->>'maxHp')::bigint;
  if variant.max_hp is null or variant.max_hp<=0 then raise exception 'invalid raid launch HP' using errcode='22023';end if;
  instance_id:=gen_random_uuid();created_time:=clock_timestamp();
  insert into public.raid_bosses(id,boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
  values(instance_id,variant.raid_variant_id,variant.raid_variant_id,variant.max_hp,variant.max_hp,lower(variant.area_id),'ACTIVE',created_time,created_time+make_interval(hours=>rule.duration_hours),gen_random_uuid(),(created_time at time zone 'Asia/Tokyo')::date,variant.raid_variant_id,'ROOM:'||instance_id::text);
  new_room:=(public._raid_room_register_v1(instance_id,uid,e.difficulty)->>'roomId')::uuid;
  insert into public.raid_room_combat_snapshots(room_id,profile,enemy_snapshot)
   values(new_room,launch_profile,public._raid_room_launch_enemy_snapshot_v1(launch_profile,instance_id,variant.max_hp));
  update public.quest_raid_encounters set status='CREATED',room_id=new_room where patrol_id=p_patrol_id;
  update public.quest_raid_encounter_progress set first_created=true,misses=0 where user_id=uid;
 exception when others then
  -- Keep DRAWN on generation failure. The Quest reward was a separate committed transaction.
  return jsonb_build_object('status','DEFERRED','patrolId',p_patrol_id,'reason','CREATE_FAILED');
 end;
 return public.quest_raid_encounter_projection_v1(p_patrol_id);
end $function$;
grant execute on function _issue_raid_daily_clear_bonus_v2(uuid,uuid) to postgres;
grant execute on function _issue_raid_room_clear_rewards_v1(uuid) to postgres;
grant execute on function _issue_raid_room_rescue_rewards_v1(uuid) to postgres;
grant execute on function _quest_raid_cash_xp_v2(uuid) to postgres;
grant execute on function _raid_room_add_member_v1(uuid,uuid) to postgres;
grant execute on function _raid_room_clear_reward_progress_v1(uuid,uuid) to postgres;
grant execute on function _raid_room_launch_enemy_snapshot_v1(jsonb,uuid,bigint) to postgres;
grant execute on function _raid_room_power_gate_v1(text,bigint) to postgres;
grant execute on function _raid_room_power_gate_v1(text,bigint) to service_role;
grant execute on function _raid_room_register_v1(uuid,uuid,text) to postgres;
grant execute on function _raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean) to postgres;
grant execute on function _raid_room_rescue_gate_v1(text,boolean,bigint,bigint,boolean) to service_role;
grant execute on function _raid_room_rescue_reward_progress_v1(uuid,uuid) to postgres;
grant execute on function acknowledge_initial_raid_guide() to authenticated;
grant execute on function acknowledge_initial_raid_guide() to postgres;
grant execute on function acknowledge_initial_raid_guide() to service_role;
grant execute on function acknowledge_raid_room_battle_recovery_v1(uuid) to authenticated;
grant execute on function acknowledge_raid_room_battle_recovery_v1(uuid) to postgres;
grant execute on function cancel_raid_room_battle_request_v1(uuid) to authenticated;
grant execute on function cancel_raid_room_battle_request_v1(uuid) to postgres;
grant execute on function capture_quest_raid_encounter_v1() to postgres;
grant execute on function create_raid_room_v1(text,text,uuid) to authenticated;
grant execute on function create_raid_room_v1(text,text,uuid) to postgres;
grant execute on function ensure_daily_raid_rooms_v1() to postgres;
grant execute on function ensure_daily_raid_rooms_v1() to service_role;
grant execute on function finalize_expired_raid_instance(uuid) to postgres;
grant execute on function finalize_expired_raid_instance(uuid) to service_role;
grant execute on function finalize_expired_raid_room_v1(uuid) to postgres;
grant execute on function finalize_expired_raid_room_v1(uuid) to service_role;
grant execute on function finalize_expired_raid_rooms_v1(integer) to postgres;
grant execute on function finalize_expired_raid_rooms_v1(integer) to service_role;
grant execute on function finalize_raid_battle(uuid,jsonb) to postgres;
grant execute on function finalize_raid_battle(uuid,jsonb) to service_role;
grant execute on function finalize_raid_room_battle_v1(uuid,jsonb) to postgres;
grant execute on function finalize_raid_room_battle_v1(uuid,jsonb) to service_role;
grant execute on function get_active_raids() to authenticated;
grant execute on function get_active_raids() to postgres;
grant execute on function get_active_raids() to service_role;
grant execute on function get_my_raid_contribution_v1(uuid) to authenticated;
grant execute on function get_my_raid_contribution_v1(uuid) to postgres;
grant execute on function get_my_raid_contribution_v1(uuid) to service_role;
grant execute on function get_quest_raid_bonus_v1(uuid) to authenticated;
grant execute on function get_quest_raid_bonus_v1(uuid) to postgres;
grant execute on function get_quest_raid_encounters_v1() to authenticated;
grant execute on function get_quest_raid_encounters_v1() to postgres;
grant execute on function get_raid_battle_route_v1(uuid) to postgres;
grant execute on function get_raid_battle_route_v1(uuid) to service_role;
grant execute on function get_raid_reward_policy_v2() to authenticated;
grant execute on function get_raid_reward_policy_v2() to postgres;
grant execute on function get_raid_room_battle_result_v1(uuid) to authenticated;
grant execute on function get_raid_room_battle_result_v1(uuid) to postgres;
grant execute on function get_raid_room_battle_result_v1(uuid) to service_role;
grant execute on function get_raid_room_battle_start_receipt_v1(uuid) to authenticated;
grant execute on function get_raid_room_battle_start_receipt_v1(uuid) to postgres;
grant execute on function get_raid_room_briefing_v1(uuid) to authenticated;
grant execute on function get_raid_room_briefing_v1(uuid) to postgres;
grant execute on function get_raid_room_clear_reward_v1(uuid) to authenticated;
grant execute on function get_raid_room_clear_reward_v1(uuid) to postgres;
grant execute on function get_raid_room_display_v1(uuid) to authenticated;
grant execute on function get_raid_room_display_v1(uuid) to postgres;
grant execute on function get_raid_room_participants_v1(uuid,integer,integer) to authenticated;
grant execute on function get_raid_room_participants_v1(uuid,integer,integer) to postgres;
grant execute on function get_raid_room_participants_v1(uuid,integer,integer) to service_role;
grant execute on function get_raid_room_rescue_reward_v1(uuid) to authenticated;
grant execute on function get_raid_room_rescue_reward_v1(uuid) to postgres;
grant execute on function get_raid_room_rescue_status_v1(uuid) to authenticated;
grant execute on function get_raid_room_rescue_status_v1(uuid) to postgres;
grant execute on function get_raid_room_rescue_v1(uuid) to authenticated;
grant execute on function get_raid_room_rescue_v1(uuid) to postgres;
grant execute on function get_raid_room_v1(uuid) to authenticated;
grant execute on function get_raid_room_v1(uuid) to postgres;
grant execute on function get_raid_room_v1(uuid) to service_role;
grant execute on function grant_canonical_raid_day_clear_reward(uuid,uuid) to postgres;
grant execute on function grant_canonical_raid_day_clear_reward(uuid,uuid) to service_role;
grant execute on function grant_canonical_raid_reward(uuid,uuid,text,text) to postgres;
grant execute on function grant_canonical_raid_reward(uuid,uuid,text,text) to service_role;
grant execute on function grant_raid_reward(uuid,uuid,integer,text) to postgres;
grant execute on function grant_raid_reward(uuid,uuid,integer,text) to service_role;
grant execute on function issue_quest_raid_encounter_bonus_v1() to postgres;
grant execute on function join_raid_room_rescue_v1(uuid) to authenticated;
grant execute on function join_raid_room_rescue_v1(uuid) to postgres;
grant execute on function list_raid_room_battle_recoveries_v1(integer) to authenticated;
grant execute on function list_raid_room_battle_recoveries_v1(integer) to postgres;
grant execute on function list_raid_room_boss_choices_v1() to authenticated;
grant execute on function list_raid_room_boss_choices_v1() to postgres;
grant execute on function list_raid_room_cards_v1(text,integer) to authenticated;
grant execute on function list_raid_room_cards_v1(text,integer) to postgres;
grant execute on function list_raid_rooms_v1(text,integer,integer) to authenticated;
grant execute on function list_raid_rooms_v1(text,integer,integer) to postgres;
grant execute on function list_raid_rooms_v1(text,integer,integer) to service_role;
grant execute on function on_canonical_daily_activity_finalized() to anon;
grant execute on function on_canonical_daily_activity_finalized() to authenticated;
grant execute on function on_canonical_daily_activity_finalized() to postgres;
grant execute on function on_canonical_daily_activity_finalized() to service_role;
grant execute on function on_canonical_guild_official_battle_exp() to anon;
grant execute on function on_canonical_guild_official_battle_exp() to authenticated;
grant execute on function on_canonical_guild_official_battle_exp() to postgres;
grant execute on function on_canonical_guild_official_battle_exp() to service_role;
grant execute on function on_raid_boss_defeated_activity() to postgres;
grant execute on function on_raid_boss_defeated_activity() to service_role;
grant execute on function on_raid_room_clear_reward_finalized_v1() to postgres;
grant execute on function on_raid_room_rescue_reward_finalized_v1() to postgres;
grant execute on function private.raid_browse_page_v1(text,integer) to authenticated;
grant execute on function private.raid_browse_page_v1(text,integer) to postgres;
grant execute on function private.raid_enemy_info_v1(text,text) to authenticated;
grant execute on function private.raid_enemy_info_v1(text,text) to postgres;
grant execute on function private.raid_page_entry_v1(uuid,uuid) to postgres;
grant execute on function private.raid_rescue_cards_v1(uuid[]) to authenticated;
grant execute on function private.raid_rescue_cards_v1(uuid[]) to postgres;
grant execute on function private.raid_room_display_v1(uuid) to authenticated;
grant execute on function private.raid_room_display_v1(uuid) to postgres;
grant execute on function private.raid_top_snapshot_v1() to authenticated;
grant execute on function private.raid_top_snapshot_v1() to postgres;
grant execute on function quest_raid_encounter_projection_v1(uuid) to postgres;
grant execute on function raid_room_can_read_v1(uuid) to postgres;
grant execute on function raid_room_projection_v1(uuid) to postgres;
grant execute on function raid_room_projection_v1(uuid) to service_role;
grant execute on function register_raid_room_v1(uuid) to authenticated;
grant execute on function register_raid_room_v1(uuid) to postgres;
grant execute on function request_raid_room_rescue_v1(uuid,uuid) to authenticated;
grant execute on function request_raid_room_rescue_v1(uuid,uuid) to postgres;
grant execute on function resolve_quest_raid_encounter_v1(uuid) to authenticated;
grant execute on function resolve_quest_raid_encounter_v1(uuid) to postgres;
grant execute on function respawn_cleared_raid_slot(uuid) to postgres;
grant execute on function respawn_cleared_raid_slot(uuid) to service_role;
grant execute on function rotate_daily_raids() to postgres;
grant execute on function rotate_daily_raids() to service_role;
grant execute on function start_raid_battle(uuid,text[],text) to authenticated;
grant execute on function start_raid_battle(uuid,text[],text) to postgres;
grant execute on function start_raid_battle(uuid,text[],text) to service_role;
grant execute on function start_raid_room_battle_v1(uuid,text[],text,uuid) to authenticated;
grant execute on function start_raid_room_battle_v1(uuid,text[],text,uuid) to postgres;
CREATE TRIGGER raid_boss_defeated_activity_trigger AFTER UPDATE OF status, current_hp ON public.raid_bosses FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = 'CLEARED'::text))) EXECUTE FUNCTION on_raid_boss_defeated_activity();
CREATE TRIGGER quest_encounter_clear_bonus AFTER INSERT ON public.raid_room_clear_rewards FOR EACH ROW EXECUTE FUNCTION issue_quest_raid_encounter_bonus_v1();
CREATE TRIGGER quest_encounter_rescue_bonus AFTER INSERT ON public.raid_room_rescue_rewards FOR EACH ROW EXECUTE FUNCTION issue_quest_raid_encounter_bonus_v1();
CREATE TRIGGER capture_quest_raid_encounter_v1 AFTER UPDATE OF status ON public.user_patrols FOR EACH ROW EXECUTE FUNCTION capture_quest_raid_encounter_v1();
commit;
