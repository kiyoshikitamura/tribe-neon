select jsonb_build_object(
'checked_at',now(),
'migrations',(select count(*) from supabase_migrations.schema_migrations),
'cron',(select jsonb_agg(to_jsonb(x) order by jobid) from (select jobid,jobname,schedule,command,active,database,username from cron.job)x),
'flags',jsonb_build_object('legacy',(select jsonb_agg(to_jsonb(t)) from public.raid_legacy_settings t),'creation',(select jsonb_agg(to_jsonb(t)) from public.raid_room_creation_settings t),'battle',(select jsonb_agg(to_jsonb(t)) from public.raid_room_battle_settings t),'rescue',(select jsonb_agg(to_jsonb(t)) from public.raid_room_rescue_settings t)),
'rules',jsonb_build_object('clear',(select jsonb_agg(to_jsonb(t) order by difficulty) from public.raid_room_clear_reward_rules t),'rescue',(select jsonb_agg(to_jsonb(t) order by difficulty) from public.raid_room_rescue_reward_rules t)),
'rooms',(select jsonb_agg(jsonb_build_object('room',to_jsonb(r),'boss',to_jsonb(b)) order by r.id) from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id where r.id in ('af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3','3972a461-b45f-4b02-8142-75f294461ae3')),
'original_users',(select jsonb_build_object('count',count(*),'md5',md5(jsonb_agg(to_jsonb(t) order by id)::text)) from public.users t where created_at<'2026-09-08T10:22:54.545Z'),
'hp_ledger',(select to_jsonb(t) from deployment_audit_raid_v1.applied_changes t where change_id='raid-preview-qa-hp-acceptance-v1')) as audit;
