begin;
do $$
declare
  v_definition text;
  v_bounds record;
  v_master jsonb;
begin
  if to_regprocedure('public.get_public_ranking_reward_master()') is null
     or to_regprocedure('public.get_my_pending_ranking_reward_notification()') is null
     or to_regprocedure('public.acknowledge_ranking_reward_notifications(uuid[])') is null then
    raise exception 'ranking reward notification RPC contract is incomplete';
  end if;

  if has_function_privilege('anon','public.get_public_ranking_reward_master()','execute')
     or not has_function_privilege('authenticated','public.get_public_ranking_reward_master()','execute') then
    raise exception 'public ranking reward master privilege mismatch';
  end if;
  if has_function_privilege('anon','public.get_my_pending_ranking_reward_notification()','execute')
     or has_function_privilege('anon','public.acknowledge_ranking_reward_notifications(uuid[])','execute') then
    raise exception 'anonymous notification access must be denied';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid='public.ranking_reward_notifications'::regclass
      and constraint_row.contype='u'
      and pg_get_constraintdef(constraint_row.oid) ilike '%recipient_user_id%period_kind%period_key%'
  ) then
    raise exception 'same-period notification idempotency constraint is missing';
  end if;

  select public.canonical_ranking_reward_payload() into v_master;
  if jsonb_typeof(v_master->'progression')<>'object' then
    raise exception 'canonical season ranking reward master is missing';
  end if;
  if coalesce(jsonb_array_length(coalesce(v_master#>'{progressionByPeriod,DAILY,PVP}','[]'::jsonb)),0)<>0
     or coalesce(jsonb_array_length(coalesce(v_master#>'{progressionByPeriod,DAILY,RAID_PERSONAL}','[]'::jsonb)),0)<>0
     or coalesce(jsonb_array_length(coalesce(v_master#>'{progressionByPeriod,DAILY,RAID_GUILD}','[]'::jsonb)),0)<>0 then
    raise exception 'this release fixture expects no canonical DAILY ranking rewards';
  end if;

  select pg_get_functiondef('public.grant_canonical_ranking_season_reward(uuid,text,uuid,uuid,integer)'::regprocedure)
    into v_definition;
  if position('ON CONFLICT DO NOTHING' in upper(v_definition))=0
     or position('IF FOUND THEN' in upper(v_definition))=0
     or position('ranking_reward_notifications' in v_definition)=0 then
    raise exception 'season grant exactly-once notification guard is missing';
  end if;

  select pg_get_functiondef('public.acknowledge_ranking_reward_notifications(uuid[])'::regprocedure)
    into v_definition;
  if position('recipient_user_id = v_uid' in v_definition)=0
     or position('ACKNOWLEDGED_AT IS NULL' in upper(v_definition))=0 then
    raise exception 'acknowledgement ownership or repeat guard is missing';
  end if;

  select * into v_bounds from public.ranking_period_bounds('RAID','2026-09-06 14:59:59.999+00');
  if v_bounds.starts_at<>'2026-08-30 15:00:00+00'::timestamptz
     or v_bounds.ends_at<>'2026-09-06 15:00:00+00'::timestamptz then
    raise exception 'RAID JST boundary before rollover is invalid';
  end if;
  select * into v_bounds from public.ranking_period_bounds('RAID','2026-09-06 15:00:00+00');
  if v_bounds.starts_at<>'2026-09-06 15:00:00+00'::timestamptz
     or v_bounds.ends_at<>'2026-09-13 15:00:00+00'::timestamptz then
    raise exception 'RAID JST boundary after rollover is invalid';
  end if;
end;
$$;
rollback;
