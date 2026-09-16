begin;

-- 保存済み初回クリアを正本にする。周回回数ではなく異なるステージ数を観測する。
create or replace function public.refresh_quest_progression_missions(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_user_id is null or (auth.uid() is not null and auth.uid()<>p_user_id) then
  raise exception 'Mission progress owner mismatch' using errcode='42501';
 end if;
 if not exists(select 1 from public.quest_progression_user_versions where user_id=p_user_id and progression_version='2026-09-16') then return; end if;
 with stages as (
  select q.quest_id,q.town_id from public.canonical_quest_master q
  where q.version='2026-08-30' and q.is_production_enabled
 ), clears as (
  select s.quest_id,s.town_id from stages s join public.user_quest_first_clears c using(quest_id)
  where c.user_id=p_user_id
 ), observations as (
  select m.id,case m.trigger_type
   when 'QUEST_STAGE_CLEAR' then case when exists(select 1 from clears where quest_id=m.condition_params->>'quest_id') then 1 else 0 end
   when 'QUEST_TOWN_CLEAR' then case when
    (select count(*) from stages where town_id=m.condition_params->>'town_id')>0
    and not exists(select 1 from stages s where s.town_id=m.condition_params->>'town_id' and not exists(select 1 from clears c where c.quest_id=s.quest_id))
    then 1 else 0 end
   when 'QUEST_STAGE_CLEAR_COUNT' then (select count(*)::integer from clears)
   when 'QUEST_ALL_STAGES_CLEAR' then case when (select count(*) from stages)=21 and (select count(*) from clears)=21 then 1 else 0 end
   end as value
  from public.missions m
  where m.is_enabled and m.category in ('NORMAL','SPECIAL')
   and m.trigger_type in ('QUEST_STAGE_CLEAR','QUEST_TOWN_CLEAR','QUEST_STAGE_CLEAR_COUNT','QUEST_ALL_STAGES_CLEAR')
   and (m.event_id is null or exists(select 1 from public.mission_events e where e.id=m.event_id and e.is_enabled and now()>=e.start_at and now()<e.progress_end_at))
 )
 update public.user_missions um
 set current_progress=least(m.target_value,o.value),progress_val=least(m.target_value,o.value),
  status=case when o.value>=m.target_value then 'CLEAR' else 'PROGRESS' end,updated_at=clock_timestamp()
 from observations o join public.missions m on m.id=o.id
 where um.user_id=p_user_id and um.mission_id=o.id and um.status='PROGRESS'
  and (um.current_progress is distinct from least(m.target_value,o.value)
   or um.status is distinct from case when o.value>=m.target_value then 'CLEAR' else 'PROGRESS' end);
end $$;
revoke all on function public.refresh_quest_progression_missions(uuid) from public,anon,authenticated;

create or replace function public.quest_progression_mission_clear_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.refresh_quest_progression_missions(new.user_id);
 return new;
end $$;
revoke all on function public.quest_progression_mission_clear_trigger() from public,anon,authenticated;
drop trigger if exists quest_progression_mission_clear on public.user_quest_first_clears;
create trigger quest_progression_mission_clear after insert on public.user_quest_first_clears
for each row execute function public.quest_progression_mission_clear_trigger();

-- 既存の同期・単体受取・一括受取で呼ばれる共通hookに追記し、既存定義を保持する。
do $patch$
declare v_definition text; v_marker text:='perform public.refresh_quest_progression_missions(p_user_id);';
begin
 v_definition:=pg_get_functiondef('public.refresh_normal_mission_owned_state(uuid)'::regprocedure);
 if position(v_marker in v_definition)=0 then
  if v_definition !~ 'end;[[:space:]]*\$function\$' then raise exception 'Owned-state function ending changed; review required'; end if;
  v_definition:=regexp_replace(v_definition,'end;([[:space:]]*\$function\$)',v_marker||E'\nend;\\1');
  execute v_definition;
 end if;
 -- SPECIALの新規行はowned-state hook後に作られるので同期末尾にも再評価を追加。
 v_definition:=pg_get_functiondef('public.sync_current_missions()'::regprocedure);
 if position('perform public.refresh_quest_progression_missions(v_user_id);' in v_definition)=0 then
  if position('perform public.ensure_active_special_missions(v_user_id);' in v_definition)=0 then raise exception 'Mission sync hook changed; review required'; end if;
  execute replace(v_definition,'perform public.ensure_active_special_missions(v_user_id);',
   E'perform public.ensure_active_special_missions(v_user_id);\n  perform public.refresh_quest_progression_missions(v_user_id);');
 end if;
end $patch$;

-- 設定例のみ。公開ミッション・報酬は別途確定するため無効で登録する。
insert into public.missions(id,category,trigger_type,title,description,desc_text,target_value,reward_item_id,reward_qty,reward_quantity,condition_params,is_enabled,is_repeatable,is_provisional,display_order,display_group,cash_reward)
values
 ('qp_template_stage','NORMAL','QUEST_STAGE_CLEAR','新宿・初級をクリア','新宿・初級をクリア','新宿・初級をクリア',1,'CHAR_EXP_M',1,1,'{"quest_id":"q_shinjuku_1"}',false,false,true,9001,'PROGRESS',0),
 ('qp_template_town','NORMAL','QUEST_TOWN_CLEAR','新宿をクリア','新宿の全ステージをクリア','新宿の全ステージをクリア',1,'CHAR_EXP_M',1,1,'{"town_id":"shinjuku"}',false,false,true,9002,'PROGRESS',0),
 ('qp_template_count','NORMAL','QUEST_STAGE_CLEAR_COUNT','3ステージをクリア','異なる3ステージをクリア','異なる3ステージをクリア',3,'CHAR_EXP_M',1,1,'{}',false,false,true,9003,'PROGRESS',0),
 ('qp_template_all','NORMAL','QUEST_ALL_STAGES_CLEAR','全ステージをクリア','全21ステージをクリア','全21ステージをクリア',1,'CHAR_EXP_M',1,1,'{}',false,false,true,9004,'PROGRESS',0)
on conflict(id) do nothing;
commit;
