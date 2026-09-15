create or replace function public.initialize_current_player(p_username text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
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