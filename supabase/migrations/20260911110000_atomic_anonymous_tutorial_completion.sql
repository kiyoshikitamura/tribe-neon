-- Keep anonymous tutorial completion and its deferred-auth gameplay authority
-- in one row update. Existing migrations remain immutable.
begin;

create or replace function public.advance_tutorial_progress(p_expected_step text,p_next_step text)
returns text language plpgsql security definer set search_path=public, auth as $$
declare
  v_user_id uuid:=auth.uid();
  v_current_step text;
  v_is_anonymous boolean:=coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  select step_id into v_current_step
  from public.tutorial_progress
  where user_id=v_user_id
  for update;
  if v_current_step is null then raise exception 'Tutorial has not started'; end if;
  if v_current_step<>p_expected_step then raise exception 'Unexpected tutorial step'; end if;
  if (p_expected_step,p_next_step) not in (
    ('WORLD_INTRO','FREE_GACHA'),('FREE_GACHA','AUTO_FORMATION'),
    ('AUTO_FORMATION','DISPATCH'),('DISPATCH','FREE_INSTANT'),
    ('FREE_INSTANT','TUTORIAL_BATTLE'),('TUTORIAL_BATTLE','RULE_GUIDE'),
    ('RULE_GUIDE','COMPLETE')
  ) then raise exception 'Invalid tutorial transition'; end if;

  update public.tutorial_progress
  set step_id=p_next_step,
      authentication_pending=case
        when p_next_step='COMPLETE' and v_is_anonymous then true
        else authentication_pending
      end,
      updated_at=now(),
      completed_at=case when p_next_step='COMPLETE' then coalesce(completed_at,now()) else completed_at end
  where user_id=v_user_id;
  return p_next_step;
end;
$$;

revoke all on function public.advance_tutorial_progress(text,text) from public, anon;
grant execute on function public.advance_tutorial_progress(text,text) to authenticated;

commit;
notify pgrst,'reload schema';
