begin;

-- P0 forward-compatibility restore for the Accepted Production frontend at
-- 7bf653b87faf0be408ab844fc9173e78695ca6fb. Keep the additive Character setup
-- APIs from 20260910013126, but restore the canonical tutorial state machine.
-- No existing tutorial row is rewritten by this migration.

create or replace function public.initialize_current_player(p_username text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid:=auth.uid();
  v_username text:=btrim(p_username);
  v_is_anonymous boolean:=coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not v_is_anonymous then raise exception 'Anonymous onboarding session is required'; end if;
  if v_username is null or char_length(v_username) not between 1 and 8 then
    raise exception 'Username must contain 1 to 8 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
  if exists(select 1 from public.users where id=v_user_id) then
    insert into public.tutorial_progress(user_id,step_id) values(v_user_id,'WORLD_INTRO') on conflict(user_id) do nothing;
    return jsonb_build_object('status','already_initialized','tutorial_step',(select step_id from public.tutorial_progress where user_id=v_user_id));
  end if;
  if exists(select 1 from public.users where lower(btrim(username))=lower(v_username)) then
    raise exception 'Username is already in use' using errcode='23505';
  end if;
  insert into public.users(id,username,current_base_id,favorite_character_id)
  values(v_user_id,v_username,'shinjuku',null);
  insert into private.initial_equipment_receipts(user_id) values(v_user_id);
  insert into public.tutorial_progress(user_id,step_id) values(v_user_id,'WORLD_INTRO') on conflict(user_id) do nothing;
  return jsonb_build_object('status','success','tutorial_step','WORLD_INTRO');
end;
$$;

create or replace function public.start_tutorial_progress()
returns text language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if not exists(select 1 from public.users where id=v_user_id) then raise exception 'Player profile is required'; end if;
  insert into public.tutorial_progress(user_id,step_id) values(v_user_id,'WORLD_INTRO') on conflict(user_id) do nothing;
  return coalesce((select step_id from public.tutorial_progress where user_id=v_user_id),'WORLD_INTRO');
end;
$$;

create or replace function public.advance_tutorial_progress(p_expected_step text,p_next_step text)
returns text language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid(); v_current_step text;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  select step_id into v_current_step from public.tutorial_progress where user_id=v_user_id for update;
  if v_current_step is null then raise exception 'Tutorial has not started'; end if;
  if v_current_step<>p_expected_step then raise exception 'Unexpected tutorial step'; end if;
  if (p_expected_step,p_next_step) not in (
    ('WORLD_INTRO','FREE_GACHA'),('FREE_GACHA','AUTO_FORMATION'),
    ('AUTO_FORMATION','DISPATCH'),('DISPATCH','FREE_INSTANT'),
    ('FREE_INSTANT','TUTORIAL_BATTLE'),('TUTORIAL_BATTLE','RULE_GUIDE'),
    ('RULE_GUIDE','COMPLETE')
  ) then raise exception 'Invalid tutorial transition'; end if;
  update public.tutorial_progress set step_id=p_next_step,updated_at=now(),
    completed_at=case when p_next_step='COMPLETE' then now() else completed_at end
  where user_id=v_user_id;
  return p_next_step;
end;
$$;

-- Cached/newer clients may still call this RPC during the rollback window.
-- Keep the signature available but make it observation-only so it cannot skip
-- WORLD_INTRO, formation/growth, Quest, or RULE_GUIDE.
create or replace function public.resume_short_tutorial()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid(); v_step text;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode='42501'; end if;
  select step_id into v_step from public.tutorial_progress where user_id=v_user_id;
  if v_step is null then raise exception 'Tutorial has not started'; end if;
  return jsonb_build_object('status','accepted_flow_restored','tutorial_step',v_step);
end;
$$;

-- Eligibility remains additive, but only a future explicitly restored short
-- flow may create it. Accepted RULE_GUIDE -> COMPLETE users are not mislabeled.
create or replace function public.on_short_tutorial_character_setup_eligible()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.step_id='COMPLETE' and old.step_id='TUTORIAL_BATTLE' then
    insert into public.user_funnel_milestones(user_id,milestone,metadata)
    values(new.user_id,'character_setup_dialog_eligible',jsonb_build_object('flow','short_tutorial_v1'))
    on conflict(user_id,milestone) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.initialize_current_player(text) from public,anon;
revoke all on function public.start_tutorial_progress() from public,anon;
revoke all on function public.advance_tutorial_progress(text,text) from public,anon;
revoke all on function public.resume_short_tutorial() from public,anon;
grant execute on function public.initialize_current_player(text) to authenticated;
grant execute on function public.start_tutorial_progress() to authenticated;
grant execute on function public.advance_tutorial_progress(text,text) to authenticated;
grant execute on function public.resume_short_tutorial() to authenticated;

commit;
notify pgrst,'reload schema';
