-- Preview限定。すべてtransaction内のfixture変更でROLLBACKする。
begin;
do $$
declare
  v_uid uuid; v_character text; v_skill uuid; v_equipment uuid; v_patrol uuid; v_j jsonb;
begin
  select u.id into v_uid from public.users u
  where exists(select 1 from public.user_skills where user_id=u.id)
    and exists(select 1 from public.user_equipments where user_id=u.id)
    and exists(select 1 from public.user_patrols where user_id=u.id)
    and exists(select 1 from public.tutorial_progress where user_id=u.id)
  order by u.created_at desc limit 1;
  if v_uid is null then raise exception 'populated Preview fixture required'; end if;
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  select id::text into v_character from public.user_characters where user_id=v_uid limit 1;
  select id into v_skill from public.user_skills where user_id=v_uid limit 1;
  select id into v_equipment from public.user_equipments where user_id=v_uid limit 1;
  select id into v_patrol from public.user_patrols where user_id=v_uid limit 1;
  delete from public.user_funnel_milestones where user_id=v_uid and milestone in ('first_main_loadout','post_tutorial_quest');
  update public.tutorial_progress set step_id='RULE_GUIDE' where user_id=v_uid;
  update public.user_skills set equipped_character_id=null where user_id=v_uid;
  update public.user_equipments set equipped_character_id=null where user_id=v_uid;
  update public.user_skills set equipped_character_id=v_character where id=v_skill;
  update public.user_equipments set equipped_character_id=v_character where id=v_equipment;
  update public.user_patrols set status='CLAIMABLE' where id=v_patrol;
  update public.user_patrols set status='COMPLETED' where id=v_patrol;
  -- Tutorial装備/Questは報酬がCLEARになってもPost-Tutorial体験ではない。
  v_j:=public.get_beginner_mission_journey();
  if (v_j#>>'{facts,character}')::boolean or (v_j#>>'{facts,quest}')::boolean then
    raise exception 'Tutorial assets/rewards skipped Character or Quest'; end if;
  update public.tutorial_progress set step_id='COMPLETE',completed_at=clock_timestamp() where user_id=v_uid;
  v_j:=public.get_beginner_mission_journey();
  if (v_j#>>'{facts,character}')::boolean or (v_j#>>'{facts,quest}')::boolean then
    raise exception 'Tutorial completion alone created post-tutorial experience'; end if;
  -- 自由先行Quest: 装備未経験、報酬受取状態に依存せず記録。
  update public.user_patrols set status='CLAIMABLE' where id=v_patrol;
  update public.user_patrols set status='COMPLETED' where id=v_patrol;
  v_j:=public.get_beginner_mission_journey();
  if not (v_j#>>'{facts,quest}')::boolean or (v_j#>>'{facts,character}')::boolean then
    raise exception 'free-exploration Quest was gated on equipment'; end if;
  -- 手動装備の同値更新は経験を捏造しない。
  update public.user_equipments set equipped_character_id=v_character where id=v_equipment;
  v_j:=public.get_beginner_mission_journey();
  if (v_j#>>'{facts,character}')::boolean then raise exception 'no-op equip created experience'; end if;
  update public.user_equipments set equipped_character_id=null where id=v_equipment;
  update public.user_equipments set equipped_character_id=v_character where id=v_equipment;
  v_j:=public.get_beginner_mission_journey();
  if not (v_j#>>'{facts,character}')::boolean then raise exception 'manual equipment success missing'; end if;
  update public.user_missions set status='CLAIMED' where user_id=v_uid and mission_id in ('MIS_N_P002','MIS_N_P003','MIS_N_P004');
  if public.get_beginner_mission_journey()->'facts' <> v_j->'facts' then raise exception 'claims changed feature experience'; end if;
  raise notice 'PASS: Tutorial separation, forward Quest, manual success, no-op exclusion, claim independence';
end $$;
select 'PASS: Post-Tutorial experience order' result;
rollback;
