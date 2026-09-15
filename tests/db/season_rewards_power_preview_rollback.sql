-- Run immediately after candidate DDL in the same transaction; always ROLLBACK.
-- No real Season activation, Season closure, eligibility approval, or retained reward grant.
create function public.season_rewards_test_asset_failure() returns trigger language plpgsql as $$
begin if new.item_id='CHAR_EXP_L' then raise exception 'season-test-atomic-failure';end if;return new;end $$;
create trigger season_rewards_test_asset_failure before insert or update on public.user_items for each row execute function public.season_rewards_test_asset_failure();
DO $$
declare sid uuid;gsid uuid;uid uuid;gid uuid;n integer;before_n integer;before_present integer;frozen text;cash_before text;
begin
 if public.monthly_power_continuous_jst_days('2026-09-24 14:59:59+00','2026-09-14 15:00+00','2026-09-30 15:00+00')<>7
 or public.monthly_power_continuous_jst_days('2026-09-24 15:00+00','2026-09-14 15:00+00','2026-09-30 15:00+00')<>6 then raise exception '6/7 day JST boundary mismatch';end if;
 if (select count(*) from public.monthly_power_reward_master)<>9 then raise exception 'master tiers';end if;
 if exists(select 1 from public.monthly_power_reward_master m,jsonb_array_elements(m.items) i where i->>'item_id' in ('CASH','DIA')) then raise exception 'cash/dia forbidden';end if;
 if exists(select 1 from public.monthly_power_reward_master where (ranking_type='POWER' and 101 between rank_min and rank_max) or (ranking_type='GUILD_POWER' and 21 between rank_min and rank_max)) then raise exception 'unranked reward';end if;
 select count(*) into before_present from public.presents;
 select md5(string_agg(id::text||':'||cash::text||':'||neon_diamonds::text,',' order by id)) into cash_before from public.users;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status) values('POWER','2026-08-02 00:00+00',clock_timestamp()-interval '1 second','FINALIZING') returning id into sid;
 insert into public.monthly_power_season_runs(season_id) values(sid);
 if public.finalize_monthly_power_season_rewards_v1(sid)->>'status'<>'SNAPSHOT_READY_REWARD_BINDINGS_REQUIRED' then raise exception 'missing honor gate';end if;
 if exists(select 1 from public.ranking_season_reward_grants where season_id=sid) then raise exception 'unapproved release';end if;
 select md5(string_agg(to_jsonb(e)::text,',' order by entity_id)) into frozen from public.monthly_power_entity_snapshots e where season_id=sid;
 perform public.snapshot_monthly_power_season_v1(sid);
 if frozen is distinct from (select md5(string_agg(to_jsonb(e)::text,',' order by entity_id)) from public.monthly_power_entity_snapshots e where season_id=sid) then raise exception 'snapshot retry drift';end if;
 begin update public.monthly_power_entity_snapshots set score=score+1 where season_id=sid;raise exception 'snapshot mutation accepted';exception when sqlstate '55000' then null;end;
 begin perform public.grant_monthly_power_items_v1(sid);raise exception 'failure trigger did not run';exception when others then if sqlerrm<>'season-test-atomic-failure' then raise;end if;end;
 if exists(select 1 from public.ranking_season_reward_grants where season_id=sid) then raise exception 'atomic ledger leak';end if;
 execute 'drop trigger season_rewards_test_asset_failure on public.user_items';
 n:=public.grant_monthly_power_items_v1(sid);if n<=0 then raise exception 'no POWER grant';end if;
 if public.grant_monthly_power_items_v1(sid)<>0 then raise exception 'duplicate POWER grant';end if;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status) values('GUILD_POWER','2026-08-02 00:00+00',clock_timestamp()-interval '1 second','FINALIZING') returning id into gsid;
 insert into public.monthly_power_season_runs(season_id) values(gsid);
 perform public.snapshot_monthly_power_season_v1(gsid);
 begin perform public.grant_monthly_power_items_v1(gsid);raise exception 'pending policy accepted';exception when others then if sqlerrm<>'Guild membership policy not approved' then raise;end if;end;
 -- Candidate policy is exercised only inside rollback; this is not approval/persisted policy.
 update public.monthly_power_season_runs set eligibility_policy='CONTINUOUS_JST_DAY1' where season_id=gsid;
 select user_id,guild_id into uid,gid from public.monthly_power_member_snapshots where season_id=gsid and continuous_season_days>=7 limit 1;
 if uid is null then raise exception 'No live 7day guild fixture available';end if;
 delete from public.guild_members where user_id=uid and guild_id=gid;
 n:=public.grant_monthly_power_items_v1(gsid);if n<=0 then raise exception 'no Guild grant';end if;
 if public.grant_monthly_power_items_v1(gsid)<>0 then raise exception 'duplicate Guild grant';end if;
 if not exists(select 1 from public.ranking_season_reward_grants where season_id=gsid and recipient_user_id=uid) then raise exception 'post-snapshot leave lost entitlement';end if;
 if (select count(*) from public.presents)<>before_present then raise exception 'Present increase';end if;
 if cash_before is distinct from (select md5(string_agg(id::text||':'||cash::text||':'||neon_diamonds::text,',' order by id)) from public.users) then raise exception 'cash/dia changed';end if;
 if has_function_privilege('authenticated','public.grant_monthly_power_items_v1(uuid)','execute') or has_function_privilege('service_role','public.grant_monthly_power_items_v1(uuid)','execute') then raise exception 'internal grant exposed';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 if jsonb_array_length(public.get_monthly_power_season_rewards_v1('POWER')->'tiers')<>5 or jsonb_array_length(public.get_monthly_power_season_rewards_v1('GUILD_POWER')->'tiers')<>4 then raise exception 'UI tier RPC';end if;
 raise notice 'PASS: 9 tiers; 6/7 JST boundary; actual snapshots; immutable; unresolved gates; atomic failure; POWER/Guild grants; retry; post-snapshot leave; zero Present/CASH/DIA; privileges; UI RPC';
end $$;
select 'PASS: monthly power candidate rollback integration' as result;
rollback;
