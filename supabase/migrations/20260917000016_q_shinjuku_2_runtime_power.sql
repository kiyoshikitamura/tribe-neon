-- Preview-only contract alignment for q_shinjuku_2 runtime acceptance.
-- No schema/table/economy/reward changes.
create or replace function public.get_canonical_quest_progression()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'quest_id', m.quest_id,
    'unlock_condition', m.unlock_condition,
    'is_unlocked', public.canonical_quest_is_unlocked(auth.uid(), m.quest_id),
    'is_first_cleared', exists(
      select 1 from public.user_quest_first_clears c
      where c.user_id = auth.uid() and c.quest_id = m.quest_id
    ),
    'enemy_tactic', 'BALANCED',
    'enemy_member_count', case when m.difficulty = 'EASY' then 3 else 5 end,
    'enemy_members', '[]'::jsonb,
    'recommended_level', case m.difficulty when 'EASY' then 5 when 'NORMAL' then 12 else 20 end,
    'recommended_power', case when m.quest_id = 'q_shinjuku_2' then 60000 else null end,
    'enemy_attributes', '[]'::jsonb
  ) order by m.display_order), '[]'::jsonb)
  from public.canonical_quest_master m
  where m.version = '2026-08-30' and m.is_production_enabled
$function$;
