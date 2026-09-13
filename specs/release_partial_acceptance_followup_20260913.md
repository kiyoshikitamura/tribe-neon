# Integrated release — partial acceptance follow-up

Status: implementation follow-up ready; Vercel deployment and remote acceptance delegated to Codex. Production release remains blocked. This file supersedes older pending-item lists for the scope below.

## Accepted baseline (user/Codex report, not re-audited here)

- Application SHA: `a58758529d301284f5dd58cf8ccab06adea88af3`
- Preview: https://tribe-neon-kt299eswn-kiyoshi-kitamura.vercel.app/
- Deployment: `dpl_2tExGr6p2tAg3RAAcpbjSSibGyvG`
- Preview Supabase: `sufvuqdnqohpfzkwxohq`
- Deployment-only `NEXT_PUBLIC_RAID_ROOM_UI_ENABLED=true`.
- Raid Encounter / same-room Home return / preparation / victory / Clear reward x2 / single Present receipt / reload idempotency: reported PASS.
- Emblem Master and Sub Master change, eight standards, Guild headers and Ranking, cross-user refresh, reload, demotion, cancellation, long names: reported PASS.
- Saved emblem: 月 / `guild_standard_07`.

Do not redo the full accepted flow. Use focused regression only where this candidate changes behavior.

## Already applied migrations — do not reapply

| Repository file | Preview history version |
| --- | --- |
| `20260913133311_guild_emblem_standard_identity.sql` | `20260913222728` |
| `20260913142410_quest_raid_combat_snapshot.sql` | `20260913222738` |

The initial failed Emblem transaction left no partial state per the acceptance report. Fresh Encounter snapshot generation passed; no old-room repair is requested. This follow-up has no migration.

## Code change in this candidate

Exclusive dialogue and cut-in now use one pause-aware component sequence: dark -> approved dialogue -> mount the existing cut-in. Hidden child animations no longer consume their duration behind the dialogue. Both battle viewers share the sequence. Ordinary skills retain immediate presentation. No reward, combat calculation, equipment ownership, or approved dialogue changes.

Local validation:

- Typecheck: PASS.
- `node scripts/test_exclusive_sequence.mjs`: PASS. Executes production component with deterministic hook/timer harness; tests 1100ms sequence, pauses in both prefix phases, resume remaining time, cut-in hold, ordinary skills, cleanup, fresh activation. Not DOM/CSS acceptance.
- `node --experimental-strip-types scripts/verify_exclusive_content.mjs`: PASS (contract checks).
- Quest Battle Result liveness: PASS (contract checks).
- Focused ESLint: 0 errors / 14 warnings.
- Build: PASS with `NEXT_PUBLIC_USE_MOCK_DB=true NEXT_PUBLIC_APP_ENV=development`. This is a local mock-backed build, not remote Vercel acceptance.

## Codex: next dedicated Preview and focused acceptance

Deploy the follow-up branch's exact SHA. Preserve Preview database target and deployment-only Room flag. Report SHA, deployment ID, immutable URL, build, and each live result separately. Do not change Production, shared aliases, or project-wide environment settings as part of this request.

1. Cut-in: on QA harness stop at equipment bands, approved dialogue, and cut-in; verify visible phase, pause hold, resume, repeated activation and reduced-motion behavior. Then verify one real exclusive-skill battle through Result: HP/replay must not advance early and must not freeze. Harness-only PASS is insufficient for final acceptance.
2. Raid rescue: separate KPI-excluded QA rescuer, two or more battles, actual contribution conditions, Rescue x2 delivery and claim. Record base reward, multiplier, resulting quantity, single grant, reload and retry behavior. Clear x2 already passed; do not substitute it for Rescue x2.
3. Raid lifecycle: expired Room UI and stale CTA handling; ordinary Raid battle through reward receipt. Use genuine lifecycle conditions or controlled Preview-only QA fixtures, clearly label fixture use.
4. Emblem security: actual RPC rejection for a member of another Guild and invalid/inactive IDs. If expiry is not represented by current master/ownership schema, record that explicitly instead of claiming an expiry test passed. Rejection must preserve stored emblem.
5. Emblem presentation: 320px and 390px widths; dialog backdrop interaction/focus; Guild search, user profile, Chat, Activity, Raid participant Guild labels. Check each actual Guild-name surface; record absent surfaces rather than inventing scope.

## Billing configuration owner -> Codex

Current reported `/api/billing/config`: HTTP 200, `available:false`. Local code validation cannot close this gate.

Required configuration in the dedicated Preview scope:

- `BILLING_SANDBOX_ENABLED=true`
- `STRIPE_SECRET_KEY`: existing Stripe test secret, securely configured by the account/settings owner.
- `STRIPE_WEBHOOK_SECRET`: matching test webhook endpoint secret, securely configured.
- `BILLING_RETURN_ORIGIN`: the chosen fixed Preview origin; coordinate it with the test webhook and the candidate used for checkout/return.

Preserve `BILLING_MODE=sandbox` and Preview Supabase/service-role target. Never use live Stripe keys or expose secret values in chat, repository, screenshots or logs. No secure source was found in the previous audit; owner configuration is an external dependency, not a newly approved game-design decision.

After configuration, require available sandbox config before Checkout. Verify successful checkout and return, duplicate/reordered webhook handling, single DIA grant, beginner eligibility, lot expiry, CASH/recovery exchange and Special categories using the approved billing contract. Report all unexecuted cases. No live charge requested.

## Asset limitation

`WEAPON_047`, `WEAPON_049`, `HEAD_020` transparency remains unresolved. Earlier generated candidates had no real alpha and changed shape, so they were rejected; originals remain unchanged. Do not mark these fixed from a checkerboard appearance. Acceptance requires actual transparent alpha plus preserved asset identity. A pixel-preserving background-removal method needs an explicit user instruction before switching from the required image-editing tool.

## Release decision

- Production: unchanged / release not approved by this handoff.
- Full integrated user-device acceptance: not yet ready.
- User-device review of already accepted Raid/Emblem surfaces can be scoped separately, without implying Billing or remaining gates passed.
- No new game-spec approval requested. Pending external input: secure Billing configuration and the asset-processing method decision.
