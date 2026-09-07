# KPI Authority Extensions 00249 — M1 implementation contract

Status: M1 PREVIEW PASS. Not approved for Production application.

Base: 20260905000248. Planned migration: 20260906000249_kpi_authority_extensions.sql.

## Unchanged authorities

- Game Start/cohort timestamp: kpi_subjects.registered_at. Never create a subject for a pre-start journey.
- Legacy tutorial COMPLETE facts remain unchanged. No canonical tutorial backfill from them.
- Retention remains subject_id based. Identity transitions are evidence only; no merge or refresh.
- Guild active_count and all feature operating states remain unchanged.
- No Production writes, deployment, refresh, or payment/GvG implementation in M1.

## Security and ingestion

- No direct client DML. Explicit RLS and table/function grants, independent of default ACLs.
- Pre-start journey tokens are high-entropy bearer capabilities, SHA-256 only at rest. Server/API must rate-limit in M2; possession of a token never authorizes a subject other than the current session subject.
- Observations use server timestamps; arrival order is retained, never repaired into an invented funnel.
- Idempotency is scoped and atomic. Compare the entire accepted payload before returning a prior result. A different payload for the same key is rejected.
- Initial metadata accepts only an optional boolean `qa`; all other keys, nested data and free text are rejected. PII does not belong in KPI metadata.
- Fact identifiers have no cascading foreign keys to gameplay users, guilds or messages.

## First My Page — canonical ready contract

The required server-resolved set is exactly Profile, Onboarding state, Identity Leader and Guild Membership. Guild membership resolves to `MEMBER` or `NOT_MEMBER`; unknown, error and inconsistent states are rejected. Leader identity must resolve in DB/API, but image/CDN loading is not required.

Banner, Mission, Chat, Activity, Ranking, Login Bonus, Present Box, Campaign, Notifications and other auxiliary/async content are not required. Their failures must not change Tutorial Complete semantics.

The handshake binds a short-lived server context to the current authenticated session and subject, verifies the legacy tutorial end only as a prerequisite, stores all four readiness results, receives a client primary-content-ready acknowledgement, and revalidates current state before recording the subject's first `FIRST_MYPAGE_ACCESS_CONFIRMED`. A route GET, caller-provided `ready=true`, or legacy COMPLETE alone is never canonical completion.

## Marketing

- X manual/import only. Real source dimension keys; absent dimensions remain NULL.
- One reporting grain per platform/account/JST day/currency coverage scope. Reject mixed grain in a scope rather than sum overlapping levels.
- Corrections append revisions; they do not overwrite history. Latest selects one revision of each stable external series.
- CTR/CPC/CPM use NULL on zero denominator and expose a zero_denominator reason. Only JPY is eligible for a JPY gate.
- Synthetic QA batches are excluded from production-facing latest metrics.
- Imported source names are advertising labels, not user information. Import review must reject PII in those fields.

## Backfill

No speculative backfill. Current leader/role alone does not prove original CREATE. Skip CREATE/JOIN history without immutable evidence. Surviving messages may be captured only when subject and membership-at-message-time resolve uniquely; deleted messages are unavailable. A backfill activation must not claim the first-ever message when earlier deleted messages may have existed: provenance/coverage must remain explicit.

## Remaining specifications

1. Acquisition denominator.
2. Account-switch Retention attribution (no merge meanwhile).
3. Post-tutorial Gacha type 1/2 mapping.
4. Formal Open approximate-threshold logic.
5. Community continuous-formation window.

## Rollout

Create and statically validate migration/tests, then Preview preflight, atomic application, postflight, rollback-isolated automated tests and QA-excluded smoke. Production receives read-only preflight only. Failed Preview tests stop rollout. Before commit, rollback the transaction; after successful application prefer additive forward fixes, never drop durable facts to roll back.
