-- Productionで先行反映済みのQuest CASH ContractをRepositoryへ正規化する。
-- CASH以外のMaster値、既存報酬、ユーザー残高の遡及補正は変更しない。
begin;

update public.canonical_quest_master
set cash_reward=case difficulty when 'EASY' then 600 when 'NORMAL' then 1200 when 'HARD' then 2000 end,
    daily_first_clear_cash=0
where version='2026-08-30' and difficulty in ('EASY','NORMAL','HARD')
  and (cash_reward is distinct from case difficulty when 'EASY' then 600 when 'NORMAL' then 1200 when 'HARD' then 2000 end
       or daily_first_clear_cash is distinct from 0);

update public.quests q
set cash_reward=m.cash_reward
from public.canonical_quest_master m
where m.version='2026-08-30' and m.quest_id=q.id
  and q.cash_reward is distinct from m.cash_reward;

-- pg_get_functiondefで読み取ったProductionの定義と同一。
CREATE OR REPLACE FUNCTION public.claim_patrol_rewards(p_patrol_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_patrol record;
 v_first boolean:=false;
 v_item record;
 v_items jsonb:='[]';
 v_xp jsonb;
 v_total_xp integer;
 v_cash bigint;
begin
 if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 select patrol.*,quest.display_name,quest.user_exp,quest.reward_pool_id,quest.cash_reward
 into v_patrol
 from public.user_patrols patrol
 join public.canonical_quest_master quest
   on quest.version='2026-08-30'
  and quest.quest_id=coalesce(patrol.course_id,patrol.quest_id)
  and quest.is_production_enabled
 where patrol.id=p_patrol_id and patrol.user_id=v_uid
 for update of patrol;
 if not found then raise exception 'patrol not found' using errcode='P0002'; end if;
 if v_patrol.status='COMPLETED' then raise exception 'patrol rewards already claimed' using errcode='23505'; end if;
 if v_patrol.status<>'CLAIMABLE' and v_patrol.expires_at>now() then raise exception 'patrol is not complete' using errcode='23514'; end if;
 if v_patrol.has_battle_event and not coalesce(v_patrol.battle_resolved,false) then raise exception 'patrol battle must be resolved before claiming rewards' using errcode='23514'; end if;
 insert into public.user_quest_first_clears(user_id,quest_id)
 values(v_uid,coalesce(v_patrol.course_id,v_patrol.quest_id))
 on conflict do nothing returning true into v_first;
 v_first:=coalesce(v_first,false);
 v_total_xp:=v_patrol.user_exp;
 v_cash:=coalesce(v_patrol.cash_reward,0);
 for v_item in
   select * from public.canonical_quest_reward_pool_items item
   where item.version='2026-08-30' and item.reward_pool_id=v_patrol.reward_pool_id
   order by item.roll_index
 loop
   if floor(random()*10000)::integer<v_item.probability_bp then
     v_item.item_id:=public.resolve_canonical_reward_item(v_item.item_id);
     insert into public.presents(user_id,item_id,quantity,message,status,expire_at)
     values(v_uid,v_item.item_id,v_item.quantity,'クエストドロップ: '||v_patrol.display_name,'UNCLAIMED',now()+interval '24 hours');
     v_items:=v_items||jsonb_build_array(jsonb_build_object('item_id',v_item.item_id,'quantity',v_item.quantity));
   end if;
 end loop;
 if v_cash>0 then
   update public.users set cash=cash+v_cash where id=v_uid;
 end if;
 v_xp:=public.apply_user_xp(v_uid,v_total_xp);
 update public.user_patrols
 set status='COMPLETED',
     rewards_accrued=jsonb_build_object('course_name',v_patrol.display_name,'cash',v_cash,'xp',v_total_xp,'items',v_items,'first_clear',v_first)
 where id=p_patrol_id;
 perform public.evaluate_mission_progress(v_uid,'PATROL_CLEAR',1);
 return jsonb_build_object('status','success','patrol_id',p_patrol_id,'course_name',v_patrol.display_name,'cash',v_cash,'xp',v_total_xp,'items',v_items,'first_clear',v_first,'level',v_xp->'level','current_xp',v_xp->'xp','leveled_up',v_xp->'leveled_up');
end $function$;

CREATE OR REPLACE FUNCTION public.on_canonical_hard_quest_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 return new;
end $function$;

-- 既存の関数権限とtriggerの接続は維持する。HARD初回関数は無作用。
commit;
