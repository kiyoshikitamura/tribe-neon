do $$
declare
  v_completion_message text;
  v_payload jsonb;
begin
  if not exists (
    select 1
    from public.mission_events
    where id = 'GVG_PREP_20260904'
      and start_at = '2026-09-04 00:00:00 Asia/Tokyo'::timestamptz
      and progress_end_at = '2026-09-09 00:00:00 Asia/Tokyo'::timestamptz
      and extract(epoch from (progress_end_at - start_at)) = 120 * 60 * 60
      and claim_deadline is null
      and is_enabled
  ) then
    raise exception 'GVG preparation 120-hour event window/claim contract mismatch';
  end if;

  select condition_params ->> 'completion_message'
  into v_completion_message
  from public.missions
  where id = 'GVG_PREP_COMPLETE'
    and event_id = 'GVG_PREP_20260904';

  if v_completion_message is distinct from E'ギルドバトル開幕の準備完了！\n9月9日の正式オープンを待とう！' then
    raise exception 'GVG preparation completion message mismatch: %', v_completion_message;
  end if;

  select payload
  into v_payload
  from public.canonical_master_freeze_versions
  where domain = 'MISSION_EVENT'
    and version = '2026-09-03'
    and is_production_enabled;

  if v_payload ->> 'event_id' is distinct from 'GVG_PREP_20260904'
    or v_payload ->> 'progress_start_jst' is distinct from '2026-09-04 00:00:00'
    or v_payload ->> 'progress_end_jst' is distinct from '2026-09-09 00:00:00'
    or (v_payload ->> 'mission_count')::integer <> 13
    or (v_payload ->> 'required_mission_count')::integer <> 12 then
    raise exception 'MISSION_EVENT canonical payload mismatch: %', v_payload;
  end if;
end;
$$;
