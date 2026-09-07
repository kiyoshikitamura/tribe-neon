# KPI Dashboard V2 M3 status — PREVIEW PASS

Date: 2026-09-07 JST. No Production migration, deployment, refresh, data write, or feature-state change was performed.

## M2

Status is `M2 PREVIEW PASS`. Authenticated HTTP 200 probing is omitted as a non-blocking internal-tool check because the existing secret is unavailable to the remote execution session. The required internal-tool controls remain satisfied: the route is not anonymously public, the bundle target is Preview, no credential is exposed, and no Gameplay/Payment/GvG write control was added.

## M3 implementation

- `/admin/kpi` now opens a read-only Validation V2 view while preserving the existing Legacy Snapshot view and its APIs behind an explicit version switch.
- Sections: Validation Status, Current Release Gate, Marketing, Acquisition Funnel, Tutorial Funnel, Post Tutorial Activation, Guild Funnel, Retention Cohort, Community, Formal Open Readiness, and GvG/Monetization/Mission shells.
- V2 performs GET-only requests. It has no release-state, payment, GvG, shop, special-gacha, refresh, or Formal Open write controls.
- Marketing requires an explicit reporting grain. Campaign names wrap rather than widening the viewport. Gate, Target, and Strong criteria are separate.
- Acquisition uses bound Game Start journeys / Title Arrival journeys. Tutorial uses only `FIRST_MYPAGE_ACCESS_CONFIRMED`; legacy COMPLETE is not used as the canonical numerator.
- Post-tutorial presentation maps `SKILL_NORMAL` to スキルガチャ and `EQUIP_NORMAL` to 装備ガチャ. Character remains unavailable because a canonical activation mapping is not fixed; Battle/Raid use post-canonical-completion lifetime milestone timestamps.
- Retention renders immature cells as `— / NOT READY`, never 0%. The current Formal Open section remains a decision-support shell.

## Local acceptance

- TypeScript: PASS.
- Production build with exact Preview project origin: PASS.
- Existing KPI fixed-domain contract: PASS.
- Existing M2 instrumentation/read contract: PASS.
- Playwright at 390×844 and 412×915: PASS. Page-wide horizontal overflow is absent; only the Retention table scrolls horizontally.
- Fixture acceptance: populated data, long campaign name, mature/incomplete Retention, NOT READY/UNAVAILABLE, Marketing empty/zero-denominator equivalent, and partial API error with retry UI: PASS.
- Existing `/admin/kpi` Legacy Snapshot component and `/api/admin/kpi/{timeseries,snapshots,refresh}` implementations were not changed.

## Preview deployment acceptance

M3 UI commit `998b40990dea19fcaebc77a70abf22a8689dbcbc` deployed successfully to `https://tribe-neon-293vgv8gt-kiyoshi-kitamura.vercel.app`. Its public client bundle contains only the expected Preview Supabase origin `https://sufvuqdnqohpfzkwxohq.supabase.co`.

The Basic-auth branch scope was corrected without revealing or changing the secret value, and commit `8d107a7` was redeployed as `3d8vL7tK6nFzC8Toop9BJ1RocVUP`. The deployment is Ready, its bundle contains only the expected Preview Supabase origin `https://sufvuqdnqohpfzkwxohq.supabase.co`, and an unauthenticated protected request returns HTTP 401 with a Basic challenge and `Cache-Control: no-store`. M3 remains PREVIEW PASS.

## Post-M3 fixed specification delta

Account-switch Retention remains subject-based with no merge. Formal Open now requires exact thresholds over the latest three mature cohorts using `sum(retained UU) / sum(Game Start UU)`, and Effective Active Guild >= 18 for three consecutive JST days. The current UI/API still describe those rules as undefined and do not evaluate them; this is a release-preflight implementation delta, not an M3 Preview acceptance regression.
