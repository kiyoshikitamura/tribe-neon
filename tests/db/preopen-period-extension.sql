-- Preview only. Simulate time in this transaction; every function definition,
-- test account, progress, claim and dialog view is restored by ROLLBACK.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create function pg_temp.preopen_qa_clock() returns timestamptz language sql volatile
as $$ select current_setting('preopen.qa_clock')::timestamptz $$;
select set_config('preopen.qa_clock','2026-09-09 00:00:00+09',true);
do $$
declare f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on p.pronamespace=n.oid
    where n.nspname='public' and p.proname in (
      'ensure_active_special_missions','evaluate_mission_progress','refresh_special_event_completion',
      'get_active_mission_events','get_pending_mission_event_dialog','mark_mission_event_dialog_viewed',
      'finalize_preopen_guild_power_season','guard_preopen_guild_power_cutoff','get_preopen_guild_power_ranking')
  loop execute replace(pg_get_functiondef(f.oid),'clock_timestamp()','pg_temp.preopen_qa_clock()'); end loop;
end;
$$;
do $$
declare
  u uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); cid text;
  s uuid; r jsonb; before_power bigint; after_power bigint; rejected boolean:=false;
begin
  select season_id into strict s from public.ranking_guild_power_season_master where event_key='PREOPEN_GUILD_POWER_2026';
  insert into public.users(id,username,level) values(u,'延長QA',3);
  insert into public.guilds(id,name,leader_id) values(g,'延長QA',u);
  insert into public.guild_members(guild_id,user_id,role) values(g,u,'MASTER');
  select character_id into strict cid from public.canonical_character_master
  where version='2026-08-21' and lv100_hp+lv100_atk+lv100_def>lv1_hp+lv1_atk+lv1_def order by character_id limit 1;
  insert into public.user_characters(id,user_id,character_id,level) values(c,u,cid,2);
  insert into public.user_main_formations(user_id,slot,user_character_id) values(u,1,c);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform public.ensure_active_special_missions(u);
  r:=public.get_active_mission_events();
  if not exists(select 1 from jsonb_array_elements(r) e where e->>'event_id'='GVG_PREP_20260904' and (e->>'is_progress_active')::boolean) then raise exception 'Mission inactive after boundary'; end if;
  perform public.evaluate_mission_progress(u,'QUEST_CLEAR_COUNT',5);
  if not exists(select 1 from public.user_missions where user_id=u and mission_id='GVG_PREP_07' and status='CLEAR') then raise exception 'No mission progress'; end if;
  r:=public.claim_mission_reward('GVG_PREP_07');
  if not coalesce((r->>'claimed')::boolean,false) then raise exception 'Claim failed'; end if;
  perform public.evaluate_mission_progress(u,'QUEST_CLEAR_COUNT',5);
  r:=public.claim_all_mission_rewards(array['GVG_PREP_08']);
  if (r->>'claimed_count')::integer<>1 then raise exception 'Bulk claim failed'; end if;
  r:=public.get_pending_mission_event_dialog();
  if r->>'event_id' is distinct from 'GVG_PREP_20260904' then raise exception 'Dialog missing'; end if;
  perform public.mark_mission_event_dialog_viewed('GVG_PREP_20260904','2026-09-09'::date);
  if public.get_pending_mission_event_dialog() is not null then raise exception 'Same-day dialog repeated'; end if;
  perform set_config('preopen.qa_clock','2026-09-10 00:00:00+09',true);
  if public.get_pending_mission_event_dialog() is null then raise exception 'Next-day dialog missing'; end if;
  r:=public.get_preopen_guild_power_ranking();
  before_power:=(r#>>'{self_guild,current_power}')::bigint;
  update public.user_characters set level=3 where id=c;
  r:=public.get_preopen_guild_power_ranking();
  after_power:=(r#>>'{self_guild,current_power}')::bigint;
  if after_power is null or before_power is null or after_power<=before_power or r->>'status'<>'ACTIVE' then raise exception 'Ranking not updating'; end if;
  begin perform public.finalize_preopen_guild_power_season();
  exception when sqlstate '22023' then rejected:=true; end;
  if not rejected then raise exception 'Premature finalization allowed'; end if;
  if exists(select 1 from public.ranking_guild_power_season_snapshots where season_id=s)
    or exists(select 1 from public.ranking_guild_power_reward_grants where season_id=s)
    or exists(select 1 from public.ranking_guild_power_finalization_audits where season_id=s)
    or exists(select 1 from public.guild_cosmetics where guild_id=g) then raise exception 'Premature settlement or entitlement'; end if;
  -- Completed rewards survive a future Human-set close; progress does not.
  perform public.evaluate_mission_progress(u,'PVP_FINALIZED_BATTLE_COUNT',3);
  perform set_config('preopen.qa_clock','2100-01-01 00:00:00+09',true);
  perform public.evaluate_mission_progress(u,'RAID_FINALIZED_BATTLE_COUNT',3);
  if exists(select 1 from public.user_missions where user_id=u and mission_id='GVG_PREP_10' and current_progress>0) then raise exception 'Progress continued after end'; end if;
  r:=public.claim_mission_reward('GVG_PREP_09');
  if not coalesce((r->>'claimed')::boolean,false) then raise exception 'Earned reward lost after end'; end if;
end;
$$;
select 'PASS: Sep 9/10 mission progress, individual/bulk claim, daily dialog, live ranking, cutoff, cron rejection, no entitlement' result;
rollback;
