-- Preview sufvuqdnqohpfzkwxohq read-only evidence. No data modification.
select jsonb_build_object(
 'checked_at',now(),
 'flags',jsonb_build_object('legacy',(select jsonb_agg(to_jsonb(t)) from public.raid_legacy_settings t),'creation',(select jsonb_agg(to_jsonb(t)) from public.raid_room_creation_settings t),'battle',(select jsonb_agg(to_jsonb(t)) from public.raid_room_battle_settings t),'rescue',(select jsonb_agg(to_jsonb(t)) from public.raid_room_rescue_settings t)),
 'rules',jsonb_build_object('clear',(select jsonb_agg(to_jsonb(t) order by difficulty) from public.raid_room_clear_reward_rules t),'rescue',(select jsonb_agg(to_jsonb(t) order by difficulty) from public.raid_room_rescue_reward_rules t)),
 'qa_room',(select jsonb_build_object('room',to_jsonb(r),'boss',to_jsonb(b)) from public.raid_rooms r join public.raid_bosses b on b.id=r.raid_boss_instance_id where r.id='c796086c-9596-450c-ba20-1f067c7aff9b'),
 'members',(select jsonb_agg(to_jsonb(t) order by user_id) from public.raid_room_members t where room_id='c796086c-9596-450c-ba20-1f067c7aff9b'),
 'starts',(select jsonb_agg(to_jsonb(t) order by created_at) from (select room_id,user_id,request_id,replay_session_id,response,created_at,recovery_acknowledged_at from public.raid_room_battle_start_requests where room_id='c796086c-9596-450c-ba20-1f067c7aff9b')t),
 'grants',(select jsonb_agg(to_jsonb(t) order by kind,room_id,user_id) from (
 select 'clear' kind,g.room_id,g.user_id,g.present_id,p.status from public.raid_room_clear_reward_grants g join public.presents p on p.id=g.present_id where g.room_id in ('af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3','c796086c-9596-450c-ba20-1f067c7aff9b')
 union all select 'rescue',g.room_id,g.user_id,g.present_id,p.status from public.raid_room_rescue_reward_grants g join public.presents p on p.id=g.present_id where g.room_id in ('af908a71-b5c3-4a73-9ef8-e1ab2b9b62e3','c796086c-9596-450c-ba20-1f067c7aff9b')
 )t)
) as audit;
