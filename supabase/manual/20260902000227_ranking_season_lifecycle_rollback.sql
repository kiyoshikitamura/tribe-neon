-- Emergency rollback: disable automatic ranking lifecycle writes while
-- preserving seasons, snapshots, audits, grants, presents, and battle history.
begin;
drop trigger if exists raid_damage_logs_ensure_season on public.raid_damage_logs;

do $unschedule$
declare v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for v_job_id in select jobid from cron.job
      where jobname in ('ranking-pvp-monthly-jst','ranking-raid-weekly-jst')
    loop
      perform cron.unschedule(v_job_id);
    end loop;
  end if;
end;
$unschedule$;

-- Remove only the exact lifecycle call injected by 00229/00230. Abort instead
-- of rewriting a function if an unexpected duplicate is present.
do $detach_lifecycle$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_pattern text;
  v_matches integer;
  v_item record;
begin
  for v_item in
    select * from (values
      ('public.start_pvp_battle(uuid,text[],text)','PVP'),
      ('public.finalize_pvp_battle(uuid,jsonb)','PVP'),
      ('public.finalize_raid_battle(uuid,jsonb)','RAID')
    ) item(signature,ranking_type)
  loop
    v_signature:=to_regprocedure(v_item.signature);
    if v_signature is null then
      raise exception 'required battle function is missing: %',v_item.signature;
    end if;
    select pg_get_functiondef(v_signature) into v_definition;
    v_pattern:=format(
      E'\\s*perform\\s+public\\.advance_ranking_season\\(%L\\s*,\\s*clock_timestamp\\(\\)\\s*\\);',
      v_item.ranking_type
    );
    select count(*) into v_matches from regexp_matches(v_definition,v_pattern,'gi');
    if v_matches>1 then
      raise exception 'unexpected duplicate lifecycle hooks in %',v_item.signature;
    end if;
    if v_matches=1 then
      v_updated:=regexp_replace(v_definition,v_pattern,E'\n','gi');
      execute v_updated;
    end if;
  end loop;
end;
$detach_lifecycle$;

drop function if exists public.converge_ranking_lifecycle_safety(timestamptz);
drop function if exists public.advance_all_ranking_seasons(timestamptz);
drop function if exists public.advance_ranking_season(text,timestamptz);
commit;
notify pgrst,'reload schema';
