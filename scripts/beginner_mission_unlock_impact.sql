begin read only;
with impact as (
  select u.id,m.id mission_id,m.reward_item_id,m.reward_quantity,m.cash_reward,um.status,
    exists(select 1 from public.user_missions pre where pre.user_id=u.id
      and pre.mission_id=m.prerequisite_mission_id and pre.status='CLAIMED') prerequisite_claimed,
    exists(select 1 from public.user_funnel_milestones f where f.user_id=u.id and f.milestone='first_main_loadout')
      or case m.id when 'MIS_N_P002' then exists(select 1 from public.user_skills s
        where s.user_id=u.id and nullif(s.equipped_character_id,'') is not null)
      else exists(select 1 from public.user_equipments e
        where e.user_id=u.id and nullif(e.equipped_character_id,'') is not null) end equip_fact
  from public.users u cross join public.missions m
  left join public.user_missions um on um.user_id=u.id and um.mission_id=m.id
  where m.id in ('MIS_N_P002','MIS_N_P003')
)
select mission_id,count(*) users,
  count(*) filter(where not prerequisite_claimed) earlier_unlock_users,
  count(*) filter(where equip_fact and coalesce(status,'PROGRESS')='PROGRESS') newly_clear_users,
  count(*) filter(where equip_fact and coalesce(status,'PROGRESS')='PROGRESS' and not prerequisite_claimed) earlier_claimable_users,
  max(reward_item_id) reward_item_id,
  sum(case when equip_fact and coalesce(status,'PROGRESS')='PROGRESS' then reward_quantity else 0 end) newly_claimable_item_quantity,
  sum(case when equip_fact and coalesce(status,'PROGRESS')='PROGRESS' then cash_reward else 0 end) newly_claimable_cash
from impact group by mission_id;
rollback;
