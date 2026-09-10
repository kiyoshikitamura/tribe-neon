begin read only;

do $$
begin
  if to_regprocedure('public.resume_short_tutorial()') is null
    or to_regprocedure('public.get_character_setup_dialog_state()') is null
    or to_regprocedure('public.complete_character_setup_dialog(text)') is null
    or to_regprocedure('private.apply_recommended_main_equipment_v1(uuid)') is null then
    raise exception 'short tutorial / Character setup RPC is missing';
  end if;
  if has_function_privilege('anon','public.resume_short_tutorial()','execute')
    or has_function_privilege('anon','public.complete_character_setup_dialog(text)','execute')
    or has_function_privilege('authenticated','private.apply_recommended_main_equipment_v1(uuid)','execute') then
    raise exception 'short tutorial / Character setup ACL is too broad';
  end if;
  if not has_function_privilege('authenticated','public.resume_short_tutorial()','execute')
    or not has_function_privilege('authenticated','public.complete_character_setup_dialog(text)','execute') then
    raise exception 'authenticated RPC grant is missing';
  end if;
  if exists(
    select 1 from public.user_funnel_milestones consumed
    where consumed.milestone='character_setup_dialog_consumed'
      and not exists(select 1 from public.user_funnel_milestones eligible
        where eligible.user_id=consumed.user_id and eligible.milestone='character_setup_dialog_eligible')
  ) then raise exception 'dialog consumption exists without eligibility'; end if;
end;
$$;

rollback;
