-- Execute on Preview AFTER candidate application. All fixtures and grants roll back.
BEGIN;
SET LOCAL statement_timeout='15s';
DO $test$
declare
  v_uid uuid;
  v_before_claimed jsonb;
  v_after_claimed jsonb;
  v_result jsonb;
begin
  select c.user_id into v_uid from public.user_characters c
  where not exists(select 1 from public.user_missions um where um.user_id=c.user_id
    and um.mission_id in ('MIS_N_G001','MIS_N_G002','MIS_N_G003') and um.status='CLAIMED')
  order by c.user_id limit 1;
  if v_uid is null then raise exception 'QA fixture needs an existing character owner'; end if;
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  select coalesce(jsonb_agg(to_jsonb(um) order by um.id),'[]') into v_before_claimed
    from public.user_missions um where user_id=v_uid and status='CLAIMED';

  update public.user_characters set level=10 where user_id=v_uid;
  insert into public.user_missions(user_id,mission_id,current_progress,progress_val,status)
  values(v_uid,'MIS_N_G001',0,0,'PROGRESS')
  on conflict(user_id,mission_id) do update set current_progress=0,progress_val=0,status='PROGRESS';
  perform public.refresh_normal_mission_owned_state(v_uid);
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_G001' and current_progress=10 and status='PROGRESS') then
    raise exception 'Owned-state progress did not normalize'; end if;
  perform public.evaluate_mission_progress(v_uid,'CHAR_LEVEL_UP',50);
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_G001' and current_progress=10 and status='PROGRESS') then
    raise exception 'Additive level event still incorrectly clears absolute level'; end if;

  update public.user_characters set level=70 where user_id=v_uid;
  perform public.sync_current_missions();
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_G001' and current_progress=30 and status='CLEAR') then
    raise exception 'Owned level did not clear unlocked stage'; end if;
  v_result:=public.claim_mission_reward('MIS_N_G001');
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_G002' and current_progress=50 and status='CLEAR') then
    raise exception 'Individual claim did not initialize next stage from owned level'; end if;
  v_result:=public.claim_all_mission_rewards(array['MIS_N_G002']);
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_G003' and current_progress=70 and status='CLEAR') then
    raise exception 'Bulk claim did not initialize next stage from owned level'; end if;
  if exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_G003' and status='CLAIMED') then
    raise exception 'New stage was auto-granted'; end if;

  update public.user_characters set level=10 where user_id=v_uid;
  perform public.refresh_normal_mission_owned_state(v_uid);
  if not exists(select 1 from public.user_missions where user_id=v_uid and mission_id='MIS_N_G003' and status='CLEAR') then
    raise exception 'Previously attained CLEAR was revoked after owned-state decrease'; end if;

  select coalesce(jsonb_agg(to_jsonb(um) order by um.id),'[]') into v_after_claimed
    from public.user_missions um where user_id=v_uid and status='CLAIMED'
    and mission_id not in ('MIS_N_G001','MIS_N_G002');
  -- Fixture must not begin with this chain claimed; fail rather than altering delivered history.
  if exists(select 1 from jsonb_array_elements(v_before_claimed) x where x->>'mission_id' in ('MIS_N_G001','MIS_N_G002')) then
    raise exception 'Choose fresh QA owner for this test'; end if;
  if v_before_claimed is distinct from v_after_claimed then raise exception 'Existing claimed history changed'; end if;
end;
$test$;
ROLLBACK;
