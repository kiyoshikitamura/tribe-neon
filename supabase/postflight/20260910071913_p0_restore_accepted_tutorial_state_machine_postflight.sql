begin read only;

do $$
declare
  v_initialize text:=pg_get_functiondef('public.initialize_current_player(text)'::regprocedure);
  v_initialize_with_invite text:=pg_get_functiondef('public.initialize_current_player(text,text)'::regprocedure);
  v_start text:=pg_get_functiondef('public.start_tutorial_progress()'::regprocedure);
  v_advance text:=pg_get_functiondef('public.advance_tutorial_progress(text,text)'::regprocedure);
  v_resume text:=pg_get_functiondef('public.resume_short_tutorial()'::regprocedure);
  v_eligible text:=pg_get_functiondef('public.on_short_tutorial_character_setup_eligible()'::regprocedure);
  v_growth text:=pg_get_functiondef('public.prepare_current_tutorial_growth()'::regprocedure);
  v_growth_continue text:=pg_get_functiondef('public.advance_current_tutorial_after_growth()'::regprocedure);
  v_formation text:=pg_get_functiondef('public.complete_current_tutorial_formation()'::regprocedure);
  v_instant text:=pg_get_functiondef('public.complete_patrol_instantly(uuid,uuid,text)'::regprocedure);
  v_auth text:=pg_get_functiondef('public.complete_tutorial_authentication(text)'::regprocedure);
  v_onboarding text:=pg_get_functiondef('public.get_current_onboarding_state()'::regprocedure);
  v_kpi text:=pg_get_functiondef('public.on_kpi_tutorial_complete()'::regprocedure);
begin
  if v_initialize !~ '''tutorial_step''\s*,\s*''WORLD_INTRO'''
    or v_initialize_with_invite !~ 'public\.initialize_current_player\(p_username\)'
    or v_start not like '%WORLD_INTRO%'
    or v_advance !~ '\(''WORLD_INTRO''\s*,\s*''FREE_GACHA''\)'
    or v_advance !~ '\(''FREE_GACHA''\s*,\s*''AUTO_FORMATION''\)'
    or v_advance !~ '\(''AUTO_FORMATION''\s*,\s*''DISPATCH''\)'
    or v_advance !~ '\(''DISPATCH''\s*,\s*''FREE_INSTANT''\)'
    or v_advance !~ '\(''FREE_INSTANT''\s*,\s*''TUTORIAL_BATTLE''\)'
    or v_advance !~ '\(''TUTORIAL_BATTLE''\s*,\s*''RULE_GUIDE''\)'
    or v_advance !~ '\(''RULE_GUIDE''\s*,\s*''COMPLETE''\)'
    or v_advance ~ '\(''TUTORIAL_BATTLE''\s*,\s*''COMPLETE''\)'
    or v_resume not like '%accepted_flow_restored%'
    or v_resume like '%update public.tutorial_progress%'
    or v_eligible !~ 'old\.step_id\s*=\s*''TUTORIAL_BATTLE''' then
    raise exception 'Accepted tutorial state machine was not restored';
  end if;
  if v_growth not like '%required_level%'
    or v_growth not like '%AUTO_FORMATION%'
    or v_growth_continue not like '%first_growth%'
    or v_formation not like '%save_main_formation%'
    or v_formation not like '%set_character_skill%'
    or v_formation !~ 'step_id\s*=\s*''DISPATCH'''
    or v_instant !~ 'step_id\s*=\s*''TUTORIAL_BATTLE'''
    or v_auth !~ 'v_tutorial_step\s*<>\s*''COMPLETE'''
    or v_auth !~ 'step_id\s*=\s*''AUTHENTICATION'''
    or v_onboarding not like '%authentication_pending%'
    or v_onboarding not like '%gameplay_authorized%'
    or v_kpi not like '%kpi_tutorial_completion_facts%' then
    raise exception 'Accepted Tutorial handoff, Loadout, Authentication, or KPI authority mismatch';
  end if;
  if not exists(
    select 1 from pg_trigger trigger_row
    join pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    where not trigger_row.tgisinternal and namespace.nspname='public'
      and relation.relname='tutorial_progress' and trigger_row.tgname='kpi_tutorial_complete_trigger'
  ) then
    raise exception 'Tutorial Complete KPI trigger is missing';
  end if;
  if has_function_privilege('anon','public.initialize_current_player(text)','execute')
    or has_function_privilege('anon','public.initialize_current_player(text,text)','execute')
    or has_function_privilege('anon','public.start_tutorial_progress()','execute')
    or has_function_privilege('anon','public.advance_tutorial_progress(text,text)','execute')
    or has_function_privilege('anon','public.resume_short_tutorial()','execute')
    or not has_function_privilege('authenticated','public.initialize_current_player(text)','execute')
    or not has_function_privilege('authenticated','public.initialize_current_player(text,text)','execute')
    or not has_function_privilege('authenticated','public.advance_tutorial_progress(text,text)','execute') then
    raise exception 'Tutorial RPC ACL mismatch';
  end if;
end;
$$;

rollback;
