do $$
begin
  if to_regprocedure('public.consume_tutorial_character_daily_free_gacha()') is null
    or to_regprocedure('public.dispatch_completed_free_normal_gacha_mission()') is null
    or to_regprocedure('public.dispatch_guild_chat_mission()') is null
    or to_regprocedure('public.refresh_daily_mission_completion_aggregates(uuid,date)') is null then
    raise exception 'TN-02 authority function is missing';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'consume_tutorial_character_daily_free_gacha_trigger'
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_trigger
    where tgname = 'dispatch_completed_free_normal_gacha_mission_trigger'
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_trigger
    where tgname = 'dispatch_guild_chat_mission_trigger'
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_trigger
    where tgname = 'daily_mission_authority_change_trigger'
      and not tgisinternal
  ) then
    raise exception 'TN-02 authority trigger is missing';
  end if;
  if (select title from public.missions where id = 'MIS_D_006') <> 'ギルドで発言しよう' then
    raise exception 'TN-02 canonical guild mission copy mismatch';
  end if;
  if (
    select count(*)
    from public.canonical_master_freeze_versions
    where domain = 'MISSION' and is_production_enabled
  ) <> 1 then
    raise exception 'TN-02 canonical mission authority must have one active version';
  end if;
end;
$$;
