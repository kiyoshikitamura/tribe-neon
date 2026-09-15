-- Skill growth is plus_val enhancement, never a skill level.
-- Preserve the mission identity, reward contract and every user's current progress.
begin;

do $$
begin
  if not exists (
    select 1 from public.missions
    where id = 'GVG_PREP_02'
      and trigger_type in ('SKILL_LEVEL_TOTAL_INCREASE', 'SKILL_ENHANCE_COUNT')
      and target_value = 5
  ) then
    raise exception 'GVG_PREP_02 expected skill enhancement mission missing or changed';
  end if;
end $$;

update public.missions
set trigger_type = 'SKILL_ENHANCE_COUNT',
    description = '開催期間中にスキルを合計5回強化',
    desc_text = '開催期間中にスキルを合計5回強化'
where id = 'GVG_PREP_02';

-- evaluate_mission_progress already maps SKILL_LIMIT_BREAK to SKILL_ENHANCE_COUNT.
-- Keep its legacy aliases for old callers/definitions; do not replay growth events
-- or rewrite user_missions, claim status, reward rows or event timing.
commit;
