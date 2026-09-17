-- Production release: retain progression state and the accepted q_shinjuku_2 value.
create or replace function public.get_canonical_quest_progression() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required' using errcode='42501';end if;
 if not public.quest_progression_enabled_v1(auth.uid()) then return public.get_canonical_quest_progression_pre_progression_v1();end if;
 select coalesce(jsonb_agg(jsonb_build_object('quest_id',m.quest_id,'progression_enabled',true,
 'recommended_power',case when m.quest_id='q_shinjuku_2' then 60000 else null end,
 'stage_order',m.display_order,'unlock_condition',m.unlock_condition,
 'is_unlocked',public.canonical_quest_is_unlocked(auth.uid(),m.quest_id),
 'is_first_cleared',exists(select 1 from public.user_quest_first_clears c where c.user_id=auth.uid() and c.quest_id=m.quest_id),
 'boss_patrol_id',p.id,'boss_ready',coalesce(p.expires_at<=now() and p.battle_result is distinct from 'VICTORY',false),
 'last_battle_result',p.battle_result,'enemy_tactic','BALANCED','enemy_member_count',case when m.difficulty='EASY' then 3 else 5 end,
 'enemy_members','[]'::jsonb,'enemy_attributes','[]'::jsonb) order by m.display_order),'[]'::jsonb) into result
 from public.canonical_quest_master m left join lateral(select x.* from public.user_patrols x where x.user_id=auth.uid()
 and coalesce(x.course_id,x.quest_id)=m.quest_id and x.progression_kind='FIRST_CLEAR' and x.status in('ONGOING','CLAIMABLE') order by x.started_at desc limit 1)p on true
 where m.version='2026-08-30' and m.is_production_enabled;
 return result;
end $$;

