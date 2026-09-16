-- The encounter bonus follows ordinary exploration rewards, excluding first-clear bonuses.
create or replace function public._quest_raid_cash_xp_v2(p_patrol uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select case when p.progression_kind in('FIRST_CLEAR','REPEAT') then
 jsonb_build_object('cash',coalesce((p.exploration_reward_receipt->>'base_cash')::bigint,q.progression_cash_reward,p.base_cash_snapshot),
 'userXp',floor(coalesce((p.exploration_reward_receipt->>'xp')::numeric,q.progression_user_exp::numeric,q.user_exp::numeric)*0.5)::integer)
 else jsonb_build_object('cash',coalesce((p.rewards_accrued->>'base_cash')::bigint,p.base_cash_snapshot,q.cash_reward::bigint),
 'userXp',floor(coalesce((p.rewards_accrued->>'xp')::numeric,q.user_exp::numeric)*0.5)::integer) end
 from public.user_patrols p join public.canonical_quest_master q on q.version='2026-08-30' and q.quest_id=coalesce(p.course_id,p.quest_id) where p.id=p_patrol
$$;

