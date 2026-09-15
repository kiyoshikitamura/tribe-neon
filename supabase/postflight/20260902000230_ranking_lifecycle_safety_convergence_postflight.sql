do $$
declare v_start_definition text;
begin
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20260902000230') then
    raise exception '00230 is not registered';
  end if;
  if exists(
    select 1 from public.ranking_seasons active
    join public.ranking_seasons closed on closed.ranking_type=active.ranking_type
      and closed.status='CLOSED' and closed.starts_at<active.starts_at
      and closed.ends_at>active.starts_at and closed.ends_at<active.ends_at
    where active.ranking_type='RAID' and active.status='ACTIVE'
  ) then raise exception 'Raid active season overlaps a closed predecessor'; end if;
  if exists(select 1 from public.ranking_season_transition_audits audit
      where audit.ranking_type='PVP' and audit.expected_projection<>audit.after_projection) then
    raise exception 'PVP projection changed during safety convergence';
  end if;
  if exists(select 1 from public.ranking_season_reward_grants grant_row
      left join public.presents present on present.id=grant_row.present_id
      where grant_row.present_id is null or present.id is null
        or present.user_id<>grant_row.recipient_user_id
        or present.item_id<>grant_row.resolved_item_id
        or present.quantity<>grant_row.quantity) then
    raise exception 'ranking grant ledger and present delivery differ';
  end if;
  select pg_get_functiondef('public.start_pvp_battle(uuid,text[],text)'::regprocedure)
  into v_start_definition;
  if position('advance_ranking_season(''PVP''' in v_start_definition)=0
     or position('advance_ranking_season(''PVP''' in v_start_definition)
        > position('select * into v_user from public.users' in lower(v_start_definition)) then
    raise exception 'PvP battle starter does not advance before rating snapshot';
  end if;
  if has_function_privilege('authenticated','public.converge_ranking_lifecycle_safety(timestamp with time zone)','execute') then
    raise exception 'safety convergence is exposed to clients';
  end if;
end;
$$;
