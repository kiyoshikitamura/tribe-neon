BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object('tables',(SELECT jsonb_agg(relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m')),'functions',(SELECT jsonb_agg(proname) FROM pg_proc WHERE pronamespace='public'::regnamespace),'room_columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name)) FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('raid_room_id','raid_rescue_id')),'replay_states',(SELECT jsonb_agg(t) FROM (SELECT battle_mode,status,finalization_status,count(*) FROM public.battle_replay_sessions GROUP BY 1,2,3)t),'raid_states',(SELECT jsonb_agg(t) FROM (SELECT status,count(*) FROM public.raid_bosses GROUP BY status)t)) AS audit;
ROLLBACK;
