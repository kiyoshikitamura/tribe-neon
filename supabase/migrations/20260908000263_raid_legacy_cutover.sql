begin;

-- 第18工程: Room移行時の旧生成/旧新規開始停止。既存維持がdefault。
-- SQL254の4本体に入口guardのみ追加。既存確定/報酬/Replayは変更しない。
create table public.raid_legacy_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true
);
insert into public.raid_legacy_settings(singleton,enabled) values(true,true);
alter table public.raid_legacy_settings enable row level security;
revoke all on table public.raid_legacy_settings from public,anon,authenticated,service_role;
comment on table public.raid_legacy_settings is '旧Raid生成/新規開始。停止変更はDB管理者がこの設定だけを単独transactionで更新。業務rowを先にlockしない。既存確定/Presentを停止しない。';

create or replace function public.start_raid_battle(p_instance_id uuid,p_character_ids text[],p_tactic text default 'ATTACK_PRIORITY') returns jsonb
language plpgsql security definer set search_path=public as $$
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
end $$;

create or replace function public.respawn_cleared_raid_slot(p_cleared_instance_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
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
end $$;

create or replace function public.rotate_daily_raids() returns void language plpgsql security definer set search_path=public as $$
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
end $$;

create or replace function public.get_active_raids() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_legacy_enabled boolean;
begin if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
 -- 設定行を先に共有lockし、管理者の停止UPDATEと開始/生成を直列化する。
 select enabled into v_legacy_enabled from public.raid_legacy_settings where singleton for share;
 if v_legacy_enabled is distinct from true then return '[]'::jsonb; end if;
 perform public.rotate_daily_raids();
 return coalesce((select jsonb_agg(jsonb_build_object('id',boss.id,'bossMasterId',master.boss_id,'bossName',master.display_name,'profileType',master.profile_type,'attribute',master.attribute,'level',master.reference_level,'currentHp',boss.current_hp,'maxHp',boss.max_hp,'baseId',boss.base_id,'spawnedAt',boss.spawned_at,'expiresAt',boss.expires_at,'status',boss.status,'skillLoadout',master.skill_loadout) order by boss.base_id) from public.raid_bosses boss join public.canonical_raid_boss_master master on master.boss_id=boss.boss_master_id where not exists(select 1 from public.raid_rooms r where r.raid_boss_instance_id=boss.id) and boss.status='ACTIVE' and boss.expires_at>clock_timestamp()),'[]'::jsonb);
end $$;

-- 公開範囲は254を維持。サービス役にも設定tableの直接権限は与えない。
revoke all on function public.start_raid_battle(uuid,text[],text),public.get_active_raids() from public,anon;
grant execute on function public.start_raid_battle(uuid,text[],text),public.get_active_raids() to authenticated;
revoke all on function public.rotate_daily_raids(),public.respawn_cleared_raid_slot(uuid) from public,anon,authenticated;
grant execute on function public.rotate_daily_raids(),public.respawn_cleared_raid_slot(uuid) to service_role;
commit;
notify pgrst, 'reload schema';
