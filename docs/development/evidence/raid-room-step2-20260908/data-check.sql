BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('observed_at',clock_timestamp(),
'variants',(SELECT jsonb_agg(jsonb_build_object('variant',v.raid_variant_id,'enabled',v.is_production_enabled,'hp',v.max_hp,'boss_master_fk_exists',m.id IS NOT NULL,'members',v.member_character_ids)) FROM public.canonical_raid_variants v LEFT JOIN public.raid_boss_master m ON m.id=v.raid_variant_id),
'users_count',(SELECT count(*) FROM public.users),'guilds_count',(SELECT count(*) FROM public.guilds),
'pending_legacy_raid_replays',(SELECT count(*) FROM public.battle_replay_sessions WHERE battle_mode='RAID' AND finalization_status='PENDING'),
'item_master',(SELECT jsonb_agg(jsonb_build_object('id',item_id,'name',display_name,'enabled',is_production_enabled)) FROM public.canonical_item_master),
'ranking_notifications_count',(SELECT count(*) FROM public.ranking_reward_notifications),
'social_types',(SELECT jsonb_agg(t) FROM (SELECT activity_type,count(*) FROM public.social_activity_feed GROUP BY activity_type)t),
'not_null_raid_insert_columns',(SELECT jsonb_agg(column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name='raid_bosses' AND is_nullable='NO' AND column_default IS NULL)
) AS audit; ROLLBACK;
