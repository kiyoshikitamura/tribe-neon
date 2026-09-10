begin read only;

do $$
declare
  v_initialize text:=pg_get_functiondef('public.initialize_current_player(text)'::regprocedure);
  v_start text:=pg_get_functiondef('public.start_tutorial_progress()'::regprocedure);
  v_advance text:=pg_get_functiondef('public.advance_tutorial_progress(text,text)'::regprocedure);
  v_resume text:=pg_get_functiondef('public.resume_short_tutorial()'::regprocedure);
  v_eligible text:=pg_get_functiondef('public.on_short_tutorial_character_setup_eligible()'::regprocedure);
begin
  if v_initialize !~ '''tutorial_step''\s*,\s*''WORLD_INTRO'''
    or v_start not like '%WORLD_INTRO%'
    or v_advance !~ '\(''TUTORIAL_BATTLE''\s*,\s*''RULE_GUIDE''\)'
    or v_advance ~ '\(''TUTORIAL_BATTLE''\s*,\s*''COMPLETE''\)'
    or v_resume not like '%accepted_flow_restored%'
    or v_resume like '%update public.tutorial_progress%'
    or v_eligible !~ 'old\.step_id\s*=\s*''TUTORIAL_BATTLE''' then
    raise exception 'Accepted tutorial state machine was not restored';
  end if;
  if has_function_privilege('anon','public.initialize_current_player(text)','execute')
    or has_function_privilege('anon','public.start_tutorial_progress()','execute')
    or has_function_privilege('anon','public.advance_tutorial_progress(text,text)','execute')
    or has_function_privilege('anon','public.resume_short_tutorial()','execute')
    or not has_function_privilege('authenticated','public.initialize_current_player(text)','execute')
    or not has_function_privilege('authenticated','public.advance_tutorial_progress(text,text)','execute') then
    raise exception 'Tutorial RPC ACL mismatch';
  end if;
end;
$$;

rollback;
