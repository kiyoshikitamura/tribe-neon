do $$
declare
  v_trigger_definition text;
  v_refresh_definition text;
begin
  select pg_get_triggerdef(oid) into v_trigger_definition
  from pg_trigger
  where tgrelid = 'public.user_missions'::regclass
    and tgname = 'daily_mission_authority_change_trigger'
    and not tgisinternal;

  if v_trigger_definition is null
    or position('new.status = ANY (ARRAY[''CLEAR''::text, ''CLAIMED''::text])' in v_trigger_definition) = 0 then
    raise exception 'TN-02 correction positive-transition trigger guard is missing';
  end if;

  select pg_get_functiondef('public.refresh_daily_mission_completion_aggregates(uuid,date)'::regprocedure)
    into v_refresh_definition;
  if position('m.is_enabled' in v_refresh_definition) = 0 then
    raise exception 'TN-02 correction enabled-mission aggregate guard is missing';
  end if;

  if exists (
    select 1
    from public.gacha_execution_history history
    where history.status = 'COMPLETED'
      and history.payment_source = 'free'
      and history.pull_count = 10
      and history.gacha_id = 'CHAR_NORMAL'
      and coalesce(history.completed_at, history.created_at) >=
        ((clock_timestamp() at time zone 'Asia/Tokyo')::date::timestamp at time zone 'Asia/Tokyo')
      and coalesce(history.completed_at, history.created_at) <
        (((clock_timestamp() at time zone 'Asia/Tokyo')::date + 1)::timestamp at time zone 'Asia/Tokyo')
      and not exists (
        select 1
        from public.user_daily_gacha_claims claim
        where claim.user_id = history.user_id
          and claim.gacha_type = 'CHARACTER'
          and claim.last_claimed_date >= (clock_timestamp() at time zone 'Asia/Tokyo')::date
      )
  ) then
    raise exception 'TN-02 correction Character entitlement backfill is incomplete';
  end if;
end;
$$;
