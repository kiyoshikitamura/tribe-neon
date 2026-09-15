# KPI Dashboard V2 M2 status — PREVIEW PASS

Date: 2026-09-07 JST. Production migration, deployment, KPI refresh and data writes were not performed.

## Runtime connection

- Acquisition: `TitleView` records `TITLE_ARRIVED` after title runtime readiness and `TAP_TO_START` on the existing interaction. `SetupView` records world-intro start/end. `initialize_current_player` success arms `NAME_COMPLETED` plus subject binding; the pending marker permits a later retry but prevents a returning session from binding an unrelated journey.
- Tutorial: `MainMyPage` reuses existing resolved leader/guild/onboarding/session state, requests the server four-authority context, waits two animation frames for primary render readiness, then acknowledges. Auxiliary Banner/Mission/Chat/Activity data do not gate completion.
- Identity: same-subject link and existing-account switch call a server route that resolves subjects from validated access tokens. Context/idempotency for same-subject retry is stable. The facts do not update subjects, `registered_at`, or Retention.
- Guild: no client writer was added. Existing 00249 membership/post triggers are the sole writers.
- Marketing: Basic-auth admin GET/POST supports X manual/import, immutable revisions, JPY validation, QA marker, actor evidence, idempotency and grain-mix rejection.

## Gates and API

- Acquisition numerator: distinct TITLE-arrived journeys with a successful binding to a subject having `kpi_subjects.registered_at`.
- Acquisition denominator: distinct TITLE-arrived journeys; journeys bound to an excluded QA/admin/test/fraud subject and explicit `qa_v1` journeys are excluded from both sides. Unbound journeys remain in the denominator.
- Tutorial numerator: distinct `FIRST_MYPAGE_ACCESS_CONFIRMED` subjects. Denominator: Game Start subjects from `kpi_subjects.registered_at`.
- Added read routes: `/api/admin/kpi/v2/{validation,acquisition,tutorial,guild,retention,community,marketing}` and `/api/admin/kpi/marketing` GET/POST.
- All admin routes inherit the existing Basic-auth proxy and return `no-store`. Metric responses include definition, numerator, denominator, value, target, status, coverage, observation status, as-of, timezone and reason.
- Retention is Classic D1-D5 by JST calendar day, subject identity only, and returns incomplete days as `NOT_READY` rather than zero/FAIL. Account-switch evidence is diagnostic only.

## Preview evidence

- Migration head: `20260906000249` (unchanged in M2).
- Rollback-only DB full chain PASS: Title, tap, world start/end, name, binding, canonical My Page, Marketing correction/QA exclusion.
- Rollback-only Guild PASS: CREATE once, two message facts, one activation, and durable fact surviving source-post deletion inside the transaction.
- Persistent counts after smoke: subjects 3, daily activity 3, aggregation runs 13, snapshots 48, acquisition journeys 0, canonical tutorial facts 0, Marketing revisions 0, Guild KPI facts 0.
- TypeScript PASS; targeted ESLint has zero errors; mock production build PASS; static M2 contract PASS; existing fixed-domain KPI contract PASS.
- Commit `429f3acb1f06525e93dd54956b78d68b2f820605`; dedicated Preview trigger commit `92e8e13d91454e8cae2d311a97d05dbe8b1f478f` deployed successfully.
- Dedicated deployment bundle contains the exact Preview origin `https://sufvuqdnqohpfzkwxohq.supabase.co`. The earlier KPI branch deployment was rejected for acceptance because its branch-specific bundle targeted Production.
- Unauthenticated V2 endpoint probe returns HTTP 401, the expected Basic challenge, and `Cache-Control: no-store`.

## HTTP acceptance disposition

The Preview Basic-auth 503 was traced to branch-scoped credentials being attached to the obsolete Production-data KPI branch rather than `codex/kpi-v2-m2-preview`. The existing credential values were not revealed or changed; their Preview branch scope was corrected and commit `8d107a7` was redeployed as Vercel deployment `3d8vL7tK6nFzC8Toop9BJ1RocVUP`. The redeployment targets `sufvuqdnqohpfzkwxohq` and returns the expected unauthenticated HTTP 401 Basic challenge with `Cache-Control: no-store`.

Authenticated HTTP 200 probing is omitted as a non-blocking internal-tool check because the existing secret is not available to the remote execution session. M2 is accepted as PASS on the already completed DB authority tests, static API contract, Preview target verification, build, unauthenticated protection and zero persistent synthetic contamination. No bypass or secret extraction was used.

## Snapshot strategy

- Read-time now: low-volume Acquisition/Tutorial/Guild current-window metrics and Marketing latest revisions.
- Daily materialization recommended before scale: Retention cohorts, community/effective-active-guild series, and acquisition/guild windows once fact volume makes multi-page reads material.
- Snapshot: formal release decisions and immutable as-of evidence after its evaluator definition is fixed. No cron was added.

## Post-tutorial Gacha mapping — fixed

The canonical presentation mapping is fixed as Type 1 = `SKILL_NORMAL` / スキルガチャ and Type 2 = `EQUIP_NORMAL` / 装備ガチャ. Migration 00220 accepts exactly those IDs and maps them to `first_free_skill_ten_pull` / `first_free_equipment_ten_pull`; the runtime guide follows the same order. Existing DB enums and event semantics remain unchanged.

## Production preflight

Read-only final-preflight repeat: head 00248, history 00249 absent, 10 dependencies present, relation/function/trigger conflicts 0 and pending runs 0. Current baseline is subjects 41, daily activity 49, guild periods 6, guild members 6, board posts 13, aggregation runs 129 and metric snapshots 557. Apply 00249 atomically first, deploy runtime/API immediately after, verify objects/triggers/grants and route health, then observe live instrumentation. Do not refresh Production. A pre-commit failure rolls back; a post-commit defect uses an additive forward fix while preserving durable facts.

## Specifications fixed after M2 implementation

- Retention identity remains `subject_id`; `ACCOUNT_SWITCH_TO_EXISTING` is not merged.
- Each D1-D5 Formal Open input is the UU-weighted result across the latest three mature cohorts. Fewer than three mature cohorts is `NOT_READY`.
- Retention thresholds are exact lower bounds: D1 38%, D2 30%, D3 26%, D4 23%, D5 21%; no tolerance is applied.
- Community requires Effective Active Guild >= 18 for three consecutive JST days.

These Formal Open evaluator rules were fixed after the current M2/M3 implementation and are not yet reflected by the existing evaluator shell. That implementation delta is tracked by the Production final preflight rather than reopening M2.
