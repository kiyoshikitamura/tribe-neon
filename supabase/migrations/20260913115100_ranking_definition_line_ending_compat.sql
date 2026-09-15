begin;

-- Supabase stores the dollar-quoted body byte-for-byte. A Windows CRLF
-- transport of the preceding migration therefore changes the raw function
-- hash even though the executable definition is identical. Normalize only
-- the reviewed definition; any substantive drift remains a hard failure.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_ranking_self_context(text,boolean)'::regprocedure)
    into v_definition;

  if md5(v_definition) = '44fc540998a7eadf3e6374cd650d8f86' then
    return;
  end if;

  if md5(replace(v_definition, chr(13), '')) <> '44fc540998a7eadf3e6374cd650d8f86' then
    raise exception 'ranking definition drift; line-ending compatibility migration refused';
  end if;

  execute replace(v_definition, chr(13), '');
end $$;

commit;
