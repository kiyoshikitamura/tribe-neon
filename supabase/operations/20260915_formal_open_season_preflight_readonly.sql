-- Previewでの準備監査専用。Season切替・cron・報酬を実行しない。
begin;
set transaction read only;
set local statement_timeout='15s';
select jsonb_build_object(
 'target_categories',(select jsonb_agg(jsonb_build_object('id',id,'type',ranking_type,'status',status,'starts_at',starts_at,'ends_at',ends_at)) from public.ranking_seasons where ranking_type in('PVP','POWER','GUILD_POWER') and status<>'CLOSED'),
 'preopen',(select jsonb_agg(jsonb_build_object('season_id',s.id,'status',s.status,'ends_at',s.ends_at,'audit_exists',exists(select 1 from public.ranking_guild_power_finalization_audits a where a.season_id=s.id))) from public.ranking_seasons s join public.ranking_guild_power_season_master m on m.season_id=s.id where m.event_key='PREOPEN_GUILD_POWER_2026'),
 'preopen_emblem_ready',exists(select 1 from public.cosmetic_master where id='guild_preopen_2026_rank_1' and active and owner_scope='GUILD' and slot='GUILD_EMBLEM' and not coalesce(metadata @> '{"standard":true}'::jsonb,false)),
 'reward_master_tiers',(select count(*) from public.monthly_power_reward_master where reward_version='20260914'),
 'honor_bindings',(select count(*) from public.monthly_power_honor_bindings where reward_version='20260914'),
 'registered_seasons',(select count(*) from public.monthly_power_season_runs),
 'unfinalized_due',(select count(*) from public.monthly_power_season_runs r join public.ranking_seasons s on s.id=r.season_id where s.ends_at<=clock_timestamp() and r.granted_at is null),
 'runner_job',(select jsonb_agg(jsonb_build_object('jobname',jobname,'schedule',schedule,'active',active,'command',command)) from cron.job where jobname='ranking-power-monthly-finalize-v1'),
 'runner_client_callable',has_function_privilege('anon','public.finalize_due_monthly_power_seasons_v1()','EXECUTE') or has_function_privilege('authenticated','public.finalize_due_monthly_power_seasons_v1()','EXECUTE')
) as season_preflight;
rollback;
