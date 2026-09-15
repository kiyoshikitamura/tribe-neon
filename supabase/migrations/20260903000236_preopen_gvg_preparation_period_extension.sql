-- Forward-only correction for the pre-open Guild Battle preparation mission window.
-- 00235 is already deployed history and intentionally remains unchanged.
begin;

do $$
begin
  if to_regclass('public.mission_events') is null
    or to_regclass('public.missions') is null
    or to_regclass('public.canonical_master_freeze_versions') is null then
    raise exception 'GVG preparation period extension prerequisites are missing';
  end if;

  update public.mission_events
  set progress_end_at = '2026-09-09 00:00:00 Asia/Tokyo'::timestamptz,
      updated_at = clock_timestamp()
  where id = 'GVG_PREP_20260904';

  if not found then
    raise exception 'GVG preparation event is missing';
  end if;

  update public.missions
  set condition_params = jsonb_set(
        coalesce(condition_params, '{}'::jsonb),
        '{completion_message}',
        to_jsonb(E'ギルドバトル開幕の準備完了！\n9月9日の正式オープンを待とう！'::text),
        true
      )
  where id = 'GVG_PREP_COMPLETE'
    and event_id = 'GVG_PREP_20260904';

  if not found then
    raise exception 'GVG preparation complete mission is missing';
  end if;

  update public.canonical_master_freeze_versions
  set payload = jsonb_set(
        payload,
        '{progress_end_jst}',
        to_jsonb('2026-09-09 00:00:00'::text),
        true
      ),
      is_production_enabled = true
  where domain = 'MISSION_EVENT'
    and version = '2026-09-03'
    and payload ->> 'event_id' = 'GVG_PREP_20260904';

  if not found then
    raise exception 'MISSION_EVENT canonical master marker is missing';
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
