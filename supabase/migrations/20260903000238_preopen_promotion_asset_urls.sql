begin;

update public.mission_events
set banner_image_url = '/promotion/mypage_banner_gvg_prep.webp',
    dialog_image_url = '/promotion/gvg_preopen_mission_keyvisual.webp',
    updated_at = clock_timestamp()
where id = 'GVG_PREP_20260904';

do $$
begin
  if not exists (
    select 1
    from public.mission_events
    where id = 'GVG_PREP_20260904'
      and banner_image_url = '/promotion/mypage_banner_gvg_prep.webp'
      and dialog_image_url = '/promotion/gvg_preopen_mission_keyvisual.webp'
  ) then
    raise exception 'GVG preparation promotion assets were not configured';
  end if;
end;
$$;

commit;
