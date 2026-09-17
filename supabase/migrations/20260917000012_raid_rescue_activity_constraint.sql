-- Preview reconciliation of the Production activity contract used by Raid Rescue.
ALTER TABLE public.social_activity_feed
  DROP CONSTRAINT IF EXISTS social_activity_feed_activity_type_check;
ALTER TABLE public.social_activity_feed
  ADD CONSTRAINT social_activity_feed_activity_type_check
  CHECK (activity_type = ANY (ARRAY[
    'SSR_CHARACTER','SSR_SKILL','SSR_EQUIPMENT','POWER_RANK_1',
    'PVP_DAILY_RANK_1','GUILD_CREATED','RAID_HELP_REQUEST','RAID_BOSS_DEFEATED'
  ]));
