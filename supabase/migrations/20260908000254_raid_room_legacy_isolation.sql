begin;

-- 第7工程: 既存非Room処理を維持し、新Roomを旧戦闘・報酬・再生成から隔離する。
-- 既存定義の出典: 00146 / 00184 / 00210 / 00211。運用フラグは変更しない。

create or replace function public.start_raid_battle(p_instance_id uuid,p_character_ids text[],p_tactic text default 'ATTACK_PRIORITY') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_user public.users%rowtype; v_instance record; v_cost integer; v_cost_type text; v_guild uuid; v_players jsonb; v_enemy jsonb:='[]'; v_member text; v_entry record; v_skill_refs jsonb; v_skills jsonb; v_replay uuid; v_seed bigint; v_slot integer:=0;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
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
end $$;

create or replace function public.finalize_raid_battle(
  p_replay_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  perform public.validate_official_battle_result(p_result);
  select * into v_instance
  from public.raid_bosses
  where id = v_replay.source_reference_id
  for update;
  if not found or v_instance.raid_day_key is null or v_instance.raid_variant_id is null then
    raise exception 'Canonical Raid instance missing' using errcode = 'P0002';
  end if;


 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=v_instance.id) then raise exception 'Room battles require the Room finalization entry point' using errcode='55000'; end if;
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
$$;

create or replace function public.finalize_expired_raid_instance(p_instance_id uuid) returns void
language plpgsql security definer set search_path=public as $$
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
end $$;

create or replace function public.respawn_cleared_raid_slot(p_cleared_instance_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_old public.raid_bosses%rowtype; v_new uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_cleared_instance_id::text||':respawn',0));
 select * into v_old from public.raid_bosses where id=p_cleared_instance_id and status='CLEARED' and respawn_after<=now() for update;
 if not found then return null; end if;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_cleared_instance_id) then return null; end if;

 if exists(select 1 from public.raid_bosses where raid_day_key=v_old.raid_day_key and base_id=v_old.base_id and status='ACTIVE' and not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=public.raid_bosses.id)) then return null; end if;
 insert into public.raid_bosses(boss_id,boss_master_id,current_hp,max_hp,base_id,status,spawned_at,expires_at,cycle_id,rotation_date,raid_variant_id,raid_day_key)
 values(v_old.boss_id,v_old.boss_master_id,v_old.max_hp,v_old.max_hp,v_old.base_id,'ACTIVE',now(),v_old.expires_at,gen_random_uuid(),v_old.rotation_date,v_old.raid_variant_id,v_old.raid_day_key) returning id into v_new;
 return v_new;
end $$;

create or replace function public.grant_canonical_raid_day_clear_reward(p_instance_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
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
end $$;

create or replace function public.grant_canonical_raid_reward(p_instance uuid,p_user uuid,p_type text,p_key text) returns integer language plpgsql security definer set search_path=public as $$
declare row record; granted integer:=0;
begin
 perform 1 from public.raid_bosses where id=p_instance for update;
 -- Room登録の正本は台帳。bossロック待機後の別SQLで確認する。
 if exists(select 1 from public.raid_rooms where raid_boss_instance_id=p_instance) then return 0; end if;
 for row in select * from public.canonical_raid_reward_master where version='2026-08-22' and reward_type=p_type and reward_key=p_key loop
 insert into public.raid_production_reward_grants values(p_instance,p_user,p_type,p_key,row.item_id,row.quantity,now()) on conflict do nothing;
 if found then insert into public.presents(user_id,item_id,quantity,message,status,expire_at) values(p_user,row.item_id,row.quantity,'レイド報酬','UNCLAIMED',now()+interval '30 days'); granted:=granted+1; end if;
 end loop; return granted; end $$;

create or replace function public.grant_raid_reward(
  p_instance_id uuid, p_user_id uuid, p_reward_id integer, p_reason text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_reward record;
begin
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
end; $$;

create or replace function public.rotate_daily_raids() returns void language plpgsql security definer set search_path=public as $$
declare v_today date:=(clock_timestamp() at time zone 'Asia/Tokyo')::date; v_pair text[]; v_area text; v_variant public.canonical_raid_variants%rowtype; v_start timestamptz; v_end timestamptz; v_cleared record;
begin
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
end $$;

create or replace function public.get_active_raids() returns jsonb language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if; perform public.rotate_daily_raids();
 return coalesce((select jsonb_agg(jsonb_build_object('id',boss.id,'bossMasterId',master.boss_id,'bossName',master.display_name,'profileType',master.profile_type,'attribute',master.attribute,'level',master.reference_level,'currentHp',boss.current_hp,'maxHp',boss.max_hp,'baseId',boss.base_id,'spawnedAt',boss.spawned_at,'expiresAt',boss.expires_at,'status',boss.status,'skillLoadout',master.skill_loadout) order by boss.base_id) from public.raid_bosses boss join public.canonical_raid_boss_master master on master.boss_id=boss.boss_master_id where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id) and boss.status='ACTIVE' and boss.expires_at>clock_timestamp()),'[]'::jsonb);
end $$;
-- 公開権限は既存と同じ。Room専用の参加・確定は公開しない。
revoke all on function public.start_raid_battle(uuid,text[],text), public.get_active_raids() from public,anon;
grant execute on function public.start_raid_battle(uuid,text[],text), public.get_active_raids() to authenticated;
revoke all on function public.finalize_raid_battle(uuid,jsonb), public.finalize_expired_raid_instance(uuid), public.respawn_cleared_raid_slot(uuid), public.grant_canonical_raid_day_clear_reward(uuid,uuid), public.grant_canonical_raid_reward(uuid,uuid,text,text), public.grant_raid_reward(uuid,uuid,integer,text), public.rotate_daily_raids() from public,anon,authenticated;
grant execute on function public.finalize_raid_battle(uuid,jsonb), public.finalize_expired_raid_instance(uuid), public.respawn_cleared_raid_slot(uuid), public.grant_canonical_raid_day_clear_reward(uuid,uuid), public.grant_canonical_raid_reward(uuid,uuid,text,text), public.grant_raid_reward(uuid,uuid,integer,text), public.rotate_daily_raids() to service_role;
commit;
notify pgrst, 'reload schema';
