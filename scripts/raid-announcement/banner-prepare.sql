-- SAFE_ADDITIVE: existing master only. Prepare hidden until Raid Production smoke PASS.
INSERT INTO public.home_banner_master
  (id,title,image_url,destination_type,destination_value,priority,active,start_at,end_at)
VALUES
  ('raid_battle_major_update','レイドバトル大幅アップデート',
   '/promotion/mypage_banner_raid_update.webp','TAB','raid',0,false,now(),NULL)
ON CONFLICT (id) DO NOTHING;

-- After deployed asset + Raid Production smoke PASS, the single release operator runs:
-- UPDATE public.home_banner_master SET active=true,start_at=now()
-- WHERE id='raid_battle_major_update';
-- Hide: set active=false. Replace: update image_url (version URL when reusing filename).
-- Do not reset end_at or active on repeated preparation.
