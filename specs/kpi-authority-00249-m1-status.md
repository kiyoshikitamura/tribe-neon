# M1 status — PREVIEW PASS

Date: 2026-09-06 JST. Production application is not approved and was not performed.

## Migration

- File: `supabase/migrations/20260906000249_kpi_authority_extensions.sql`
- SHA-256: `a7804a3300171d0d2a8fdddb57cda31f2e3811f32a952e9c8e60e2662a308ee0`
- Base/head transition in Preview: `20260905000248` -> `20260906000249`.
- Safe additive: 12 tables, 4 views, 12 functions, 2 trigger integrations, RLS on every new table, explicit grants, no backfill and no existing semantic replacement.

## Canonical First My Page contract

`FIRST_MYPAGE_ACCESS_CONFIRMED` means tutorial end plus successful resolution of Profile, Onboarding state, Identity Leader and Guild Membership (`MEMBER` or `NOT_MEMBER`), followed by a session-bound server context and client primary-content-ready acknowledgement. Banner, Mission, Chat, Activity, Ranking, Login Bonus, Present Box, Campaign and Notifications are not required.

The server revalidates the current session/subject and the four requirements at acknowledgement. The canonical fact is unique per subject. Legacy `tutorial_progress.step = COMPLETE` is only a prerequisite and is neither rewritten nor used as the canonical fact.

## Authority implementation

- Acquisition: hashed journey bearer, server timestamps, event allowlist, payload-aware idempotency and current-session-only subject binding. A pre-start journey never creates `kpi_subjects`.
- Identity: evidence-only same-subject link/account-switch facts. No subject mutation, cohort merge or Retention refresh.
- Guild: forward-only CREATE/JOIN conversion facts from membership creation, durable user-authored message facts, first-message activation once per membership period, and daily chat/effective-active-guild support views.
- Marketing: X manual/import batches, immutable reporting-grain scope, append-only revisions, latest revision view, zero-denominator NULL/reason and JPY gate eligibility. QA batches are excluded from the canonical latest view.

## Backfill

NONE. Acquisition history, canonical Tutorial Complete, identity transitions, deleted chat and ambiguous CREATE/JOIN history were not inferred.

## Validation

- Isolated PostgreSQL 17 migration/acceptance suite: PASS; transaction rolled back.
- Preview preflight: 00249 absent; head 00248; one excluded QA subject satisfied the four-readiness prerequisites.
- Preview postflight: history row exactly one; 12/12 tables; 12/12 RLS; 4/4 views; 12/12 functions.
- Preview DB/security/synthetic chain test: PASS after fixture-only corrections for existing guild-name/join-level guards and canonical Marketing QA filtering; every attempt was transaction-scoped and rolled back.
- Persistent synthetic rows after smoke: zero.
- Existing Preview KPI integrity before/after: subjects 3, daily activity 3, runs 13, snapshots 48; unchanged.

## Production read-only preflight

- Project ref: `ktpolnkyyfkowxdmijww`.
- Head 00248; 00249 absent; 16 relation/view conflicts, 12 function conflicts and 2 trigger-name conflicts: zero.
- All 10 required dependency relations exist; pending/running KPI aggregation runs: zero.
- Current relevant size: subjects 33, guild members 5, board posts 13.
- Applicable: YES, subject to a separate Production approval and an immediate repeat preflight.
- Expected lock/write scope: new-object catalog writes; brief DDL locks for trigger creation on `guild_members` and `board_posts`, plus FK/view dependency locks. No backfill, refresh, feature-state write or existing-row update.
- Failure before commit rolls back atomically. After a committed Production application, preserve durable facts and use additive forward fixes rather than destructive rollback.

## Spec gaps remaining

1. Acquisition denominator.
2. Account-switch Retention attribution; `subject_id` remains canonical and no merge occurs.
3. Post-tutorial Gacha type 1/2 mapping.
4. Formal Open approximate-threshold logic.
5. Community continuous-formation window.

## Next

M2 is ready for application instrumentation/API design: acquisition endpoints, My Page context/ack handshake calls, identity transition writer calls at auth flows, and admin/service-role Guild/Marketing ingestion paths. Production 00249 application remains a separate approval gate.
