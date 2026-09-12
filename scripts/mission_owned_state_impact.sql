BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';
with owned as (
select u.id user_id,(select coalesce(max(level),0) from user_characters where user_id=u.id) char_level,
(select coalesce(max(awakening_level),0) from user_characters where user_id=u.id) char_awake,
(select coalesce(max(plus_val),0) from user_skills where user_id=u.id) skill_plus,
(select coalesce(max(plus_val),0) from user_equipments where user_id=u.id) equip_plus from users u
), assessed as (select um.user_id,um.status,um.current_progress,m.id,m.trigger_type,m.target_value,m.reward_item_id,m.reward_quantity,m.cash_reward,
case m.trigger_type when 'CHARACTER_LEVEL_AT_LEAST' then o.char_level when 'CHARACTER_AWAKENING_AT_LEAST' then o.char_awake when 'SKILL_AWAKENING_AT_LEAST' then o.skill_plus when 'EQUIPMENT_LIMIT_BREAK_AT_LEAST' then o.equip_plus end observed
from user_missions um join missions m on m.id=um.mission_id join owned o on o.user_id=um.user_id where m.is_enabled and m.category='NORMAL' and m.trigger_type in ('CHARACTER_LEVEL_AT_LEAST','CHARACTER_AWAKENING_AT_LEAST','SKILL_AWAKENING_AT_LEAST','EQUIPMENT_LIMIT_BREAK_AT_LEAST'))
select id,trigger_type,status,count(*) existing_rows,count(*) filter(where status='PROGRESS' and observed>=target_value) newly_clear,count(*) filter(where status='CLEAR' and observed<target_value) below_current_threshold,count(*) filter(where status<>'CLAIMED' and current_progress<>least(observed,target_value)) progress_changes,max(reward_item_id) reward_item_id,max(reward_quantity) reward_quantity,max(cash_reward) cash_reward from assessed group by id,trigger_type,status order by id,status;
ROLLBACK;
