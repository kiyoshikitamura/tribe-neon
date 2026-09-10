# GAME03 Daily / CTA / Activity release

## Authority decision

DB impact is `REQUIRES_MIGRATION`. Existing Mission, inventory, funnel milestone, Raid room, Guild, and Activity tables remain authoritative; no table is added.

- Daily Mission `MIS_D_010` uses the existing finalized PvP battle-count trigger and exactly-once Mission claim RPCs. Reward is `RAID_POINT_TICKET` x1.
- Post-tutorial flow is free gacha → loadout → Quest → Battle → Raid → Mission. Guild membership is not a prerequisite.
- New SSR Activity generation is disabled. Existing rows remain stored, and the feed projection excludes them.
- Ranking first place remains visible. Guild creation remains sourced by its existing trigger, with the Guild name payload rendered by MyPage.
- Raid Boss defeat is emitted once per room boss instance, attributed to the Raid owner.

## Release checks

Run `npm run verify:game03-daily-cta-activity`, `npm run typecheck`, `npm run lint`, `npm run build`, the focused Playwright specs, and the guarded DB postflight. Preview should be checked at 390x844 and 412x915 before Production promotion.

## 2026-09-10 result

- Contract verification, typecheck, lint (0 errors), local build, and focused browser regression passed.
- Preview DB `sufvuqdnqohpfzkwxohq` and Production DB `ktpolnkyyfkowxdmijww` passed rollback rehearsal, migration, and read-only postflight.
- Preview deployment `dpl_2Y5p4tckVzodHc5tD7F45sEQpMTR` passed 390x844 and 412x915 visual checks without horizontal overflow.
- Production deployment `dpl_AxnwvmMgBbk7Ty29WVFxTkRvm6pe` is READY and serves both `tribe-neon.com` and `www.tribe-neon.com`.
- Supabase advisors found no GAME03 performance warning. The two security warnings are intentional authenticated-only `SECURITY DEFINER` RPCs (`complete_activation_mission_handoff`, `get_recent_social_activity_feed`); both validate `auth.uid()` and retain restricted ACLs.
- Raid Boss defeat count was 0 in the latest 24-hour Preview and Production postflights, so no Activity flooding was observed. No new rate limit was introduced.
