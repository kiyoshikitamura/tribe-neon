-- Append to candidate migration with its COMMIT removed. Always rollback.
create function public.season_honor_test_failure() returns trigger language plpgsql as $$begin raise exception 'honor-test-failure';end $$;
create trigger season_honor_test_failure before insert on public.user_cosmetics for each row execute function public.season_honor_test_failure();
DO $$declare sid uuid;gid uuid;uid uuid;gsid uuid;oldn integer;result jsonb;rc integer;begin
 if public.monthly_power_continuous_jst_days('2026-09-24 14:59:59+00','2026-09-14 15:00+00','2026-09-30 15:00+00')<>7
 or public.monthly_power_continuous_jst_days('2026-09-24 15:00+00','2026-09-14 15:00+00','2026-09-30 15:00+00')<>6 then raise exception 'continuous days';end if;
 select count(*) into oldn from public.presents;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status) values('POWER','2026-08-02',clock_timestamp()-interval '1 second','FINALIZING') returning id into sid;
 insert into public.monthly_power_season_runs(season_id) values(sid);
 begin
 delete from public.monthly_power_honor_bindings where cosmetic_id='season_power_champion_profile_badge_20260914';
 perform public.finalize_monthly_power_season_rewards_v1(sid);raise exception 'partial binding accepted';
 exception when others then if sqlerrm<>'Season honor exact binding mismatch' then raise;end if;end;
 begin perform public.finalize_monthly_power_season_rewards_v1(sid);raise exception 'expected honor failure';exception when others then if sqlerrm<>'honor-test-failure' then raise;end if;end;
 if exists(select 1 from public.ranking_season_reward_grants where season_id=sid) or exists(select 1 from public.monthly_power_entity_snapshots where season_id=sid) then raise exception 'atomic leak';end if;
 execute 'drop trigger season_honor_test_failure on public.user_cosmetics';
 result:=public.finalize_monthly_power_season_rewards_v1(sid);
 if result->>'status'<>'CLOSED' or (result->>'honors_granted')::integer=0 or (result->>'items_granted')::integer=0 then raise exception 'power closure';end if;
 if public.finalize_monthly_power_season_rewards_v1(sid)->>'retry'<>'true' then raise exception 'retry';end if;
 if not exists(select 1 from public.monthly_power_honor_grants g join public.user_titles t on t.user_id=g.entity_id and t.title_id=g.cosmetic_id where g.season_id=sid) then raise exception 'title authority missing';end if;
 insert into public.ranking_seasons(ranking_type,starts_at,ends_at,status) values('GUILD_POWER','2026-08-02',clock_timestamp()-interval '1 second','FINALIZING') returning id into gsid;
 insert into public.monthly_power_season_runs(season_id) values(gsid);
 perform public.snapshot_monthly_power_season_v1(gsid);
 select user_id,guild_id into uid,gid from public.monthly_power_member_snapshots where season_id=gsid and continuous_season_days>=7 limit 1;
 if uid is null then raise exception 'no eligible member';end if;
 delete from public.guild_members where user_id=uid and guild_id=gid;
 result:=public.finalize_monthly_power_season_rewards_v1(gsid);
 if result->>'status'<>'CLOSED' then raise exception 'guild closure';end if;
 if not exists(select 1 from public.ranking_season_reward_grants where season_id=gsid and recipient_user_id=uid) then raise exception 'leave entitlement lost';end if;
 if exists(select 1 from public.ranking_season_reward_grants g join public.monthly_power_member_snapshots m on m.season_id=g.season_id and m.user_id=g.recipient_user_id where g.season_id=gsid and m.continuous_season_days<7) then raise exception 'ineligible item';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 result:=public.get_my_pending_ranking_reward_notification();
 if not exists(select 1 from jsonb_array_elements(result->'grants') g where g->>'period_key'=gsid::text and g->>'reward_kind'='COSMETIC') then raise exception 'honor receipt missing';end if;
 if public.finalize_monthly_power_season_rewards_v1(gsid)->>'retry'<>'true' then raise exception 'guild retry';end if;
 if (select count(*) from public.presents)<>oldn then raise exception 'Present increase';end if;
 if has_function_privilege('authenticated','public.finalize_monthly_power_season_rewards_v1(uuid)','execute') then raise exception 'public finalizer';end if;
end $$;
DO $$declare gid uuid;uid uuid;cid text:='season_guild_power_top3_guild_emblem_20260914';res jsonb;begin
 select m.guild_id,m.user_id into gid,uid from public.guild_members m join public.guilds g on g.id=m.guild_id where m.role='MASTER' and not g.is_disbanded limit 1;
 insert into public.guild_cosmetics(guild_id,cosmetic_id,source_type) values(gid,cid,'QA_ROLLBACK') on conflict do nothing;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 res:=public.set_guild_emblem(gid,cid);
 if res->>'asset_path'<>'/guild-emblems/guild_standard_01.svg' or not exists(select 1 from public.guilds where id=gid and logo_icon=res->>'asset_path') then raise exception 'official emblem sync';end if;
 if not exists(select 1 from jsonb_array_elements(public.get_equipped_season_honors('GUILD',gid)) h where h->>'cosmetic_id'=cid) then raise exception 'public honor projection';end if;
end $$;
select 'PASS: monthly honors, atomic rollback, title ownership, direct item, snapshots, continuous seven days, leave entitlement, retry, notification' result;
rollback;
