-- Static contract test for the P0 read-authority fix.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.raid_room_can_read_v1(uuid)'::regprocedure)
    into v_definition;
  if position('rotation_date =' in v_definition) > 0
     or position('private.raid_daily_targets' in v_definition) > 0 then
    raise exception 'raid_room_can_read_v1 still depends on Daily Target date';
  end if;
  if position('b.status = ''ACTIVE''' in v_definition) = 0
     or position('b.current_hp > 0' in v_definition) = 0
     or position('b.expires_at > statement_timestamp()' in v_definition) = 0
     or position('b.outcome_finalized_at is null' in v_definition) = 0 then
    raise exception 'ACTIVE Room lifetime predicates are missing';
  end if;
end;
$$;
