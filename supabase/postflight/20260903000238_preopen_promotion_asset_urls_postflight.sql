do $$
begin
  if not exists (
    select 1
    from public.mission_events
    where id = 'GVG_PREP_20260904'
      and banner_image_url = '/promotion/mypage_banner_gvg_prep.webp'
      and dialog_image_url = '/promotion/gvg_preopen_mission_keyvisual.webp'
  ) then
    raise exception '00238 postflight failed: promotion asset URLs do not match';
  end if;
end;
$$;
