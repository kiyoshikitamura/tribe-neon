# KPI Dashboard V2 — Production Release Record

Date: 2026-09-07 JST.

Status: **PRODUCTION RELEASE COMPLETE.**

## Formal Open evaluator

- Retention identity remains `subject_id`; `AUTH_LINK_SAME_SUBJECT` continues the same subject and `ACCOUNT_SWITCH_TO_EXISTING` is a separate subject. Transition facts remain diagnostic only.
- Each D1-D5 gate uses the latest three independently mature cohorts and computes `sum(retained_uu) / sum(game_start_uu)`. Fewer than three mature cohorts is `NOT_READY`.
- Thresholds are D1 38%, D2 30%, D3 26%, D4 23%, D5 21%.
- Community passes only when Effective Active Guild is at least 18 for three consecutive completed JST days. Less than three observed days is `NOT_READY`; a completed three-day window below threshold is `FAIL`.
- Overall precedence is `NOT_READY`, then `FAIL`, then `GO` when all ten required components pass.
- The evaluator is Decision Support only and has no feature-state mutation path.

Preview fixture acceptance passed for: all-pass, two-cohort not-ready, weighted failure, unequal cohort weighting, non-simple-average behavior, 18/18/18, 18/17/18, two-day not-ready, future-day exclusion, one-component fail and one-component not-ready.

## Production migration

- Project: `ktpolnkyyfkowxdmijww`.
- Before head: `20260905000248`; 00249 history rows: 0.
- Final preflight: dependencies 10/10, object/function/trigger conflicts 0, pending aggregations 0.
- Migration: `20260906000249_kpi_authority_extensions.sql`.
- SHA-256: `a7804a3300171d0d2a8fdddb57cda31f2e3811f32a952e9c8e60e2662a308ee0`.
- Applied atomically with no backfill and no KPI refresh.
- After head: `20260906000249`; history rows: exactly 1.
- Postflight: 12 relations with RLS, 4 security-invoker views, 12 functions with explicit search paths, 11 security-definer writer functions and 2 triggers.
- All new canonical fact/import tables were empty after migration and remained empty at the bounded release canary read.
- Feature operating state row count remained 26; guild membership count remained 6; board-post count remained 13; pending aggregations remained 0.

Normal concurrent application activity changed legacy aggregate counts during the release window (subjects 43 to 44, daily activity 51 to 52, aggregation runs 132 to 138, snapshots 570 to 600). The migration itself contains no legacy-data DML or refresh call; new-authority rows stayed zero.

## Deployment

- Release commit: `8681202b293e7cf1559f3db3c89f59717725a894` (`feat: finalize KPI formal open readiness`).
- Dedicated branch: `codex/kpi-dashboard-production-20260904`, fast-forwarded from `429f3ac`.
- Vercel deployment ID: `3xt4EYn2kXK8o4rTRxVuo1SVu9dq`.
- Deployment URL: `https://tribe-neon-3jkai9ebf-kiyoshi-kitamura.vercel.app`.
- Result: Ready; build time 36 seconds; branch and commit parity confirmed.
- The branch-specific KPI data variables remain scoped to the Production Supabase target.

## Basic Auth and HTTP

- Existing Basic-auth values were retained; only the two variable scopes were moved to the dedicated Production-data branch. No value was logged or added to source.
- Anonymous `/admin/kpi`: HTTP 401, Basic challenge present, `Cache-Control: no-store`.
- Anonymous `/api/admin/kpi/v2/validation`: HTTP 401, Basic challenge present, `Cache-Control: no-store`.
- Credentialed HTTP/Human interaction was omitted because this execution session cannot retrieve the write-only existing password. This is non-blocking under the approved internal-tool acceptance policy; the previous 503 condition is closed because both credentials are now present in the deployed branch scope and the response is 401 rather than missing-config 503.

## Human/UI acceptance

- V2 and Legacy views, desktop, 390x844, 412x915, empty/error/NOT READY states and Formal Open presentation passed before release on the same commit.
- Production-target deployment is reachable at the Vercel URL and is not anonymously public.
- No Formal Open, Payment, GvG, Shop or Special Gacha write control exists in the dashboard.

## Canary and regression

- A bounded read-only Production canary found no eligible post-release Acquisition, canonical Tutorial or Guild fact yet. No synthetic Production event was created.
- This is an observation-window limitation, not a writer failure signal. The trigger/functions exist and passed Preview runtime acceptance.
- TypeScript, lint, optimized build, M2 contracts, Formal Open fixtures and responsive Playwright acceptance passed on the released commit.
- Existing KPI semantics and facts were not rewritten. Gameplay and feature operating states were not changed by the release.

## Non-blocking follow-up

- Recheck the canonical fact counts after the next natural eligible Acquisition, Tutorial and Guild actions and confirm exactly-once generation.
- Perform credentialed Production Human Acceptance when an authorized operator with the existing Basic-auth credential is available.
- `kpi.tribe-neon.com` did not resolve from the remote execution environment; use the verified Vercel deployment URL or repair/verify the custom-domain DNS separately if that hostname is intended for operators.
