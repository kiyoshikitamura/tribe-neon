# Device acceptance corrections — 2026-09-14

Parent: a3aef73775aec36c2b31387f73c926aa6d5198a8.
Baseline remains 661dfd3 + previously confirmed Production differences. No additional Production differences imported.

User reported three NGs on dpl_7up1YTu9jhRg1MEPBiQM1EGGsaoS: cleared Easy looks dark, Roppongi difficulty order, PvP cannot start. Other items in that device request were reported without bugs; this is not full-game acceptance.

## Corrections

- Quest: explicit readable button colors and selected styling; cleared/replayable label. Only locked courses disabled. Explicit EASY / NORMAL / HARD order independent of RPC row order. Easy default and in-screen selection preserved.
- PvP: matchmaking uses Main Formation but start RPC required legacy defense deck. Preview had 12 of 75 Main users without legacy decks. Change only opponent selection and snapshot input to saved Main. Preserve snapshot builder, BP, replay, season and privileges. No legacy decks generated.
- News: the existing release_news_foundation migration was absent from Preview. Applied original repository DDL, including published-window read RLS. No news rows inserted or announcements published. Exact reported REST request now HTTP 200, empty array.

## Preview DB

Ref: sufvuqdnqohpfzkwxohq.

| Repository migration | Applied history version |
|---|---|
| 20260909163114_release_news_foundation | 20260914115053 |
| 20260914115128_pvp_opponent_main_formation_start | 20260914115426 |

Unrelated scheduled PvP transition migration remains unapplied.

## Verification

- Quest state and all-seven-town difficulty ordering tests: PASS; shared arrays unchanged.
- Typecheck: PASS. Local Next webpack build with explicit Mock environment: PASS. Live Preview build tracked separately.
- PvP original failure reproduced without BP leakage. Patched official RPC tested with Main-only opponent; both parties five members, opponent full server snapshot exact match, server replay authority and BP response consistent, missing formation fails without additional BP/replay changes. All test writes rolled back. Repeated after permanent Preview migration: PASS.
- News: HTTP 200; RLS enabled; anonymous/authenticated SELECT allowed, authenticated INSERT denied; zero rows.
- Actual device appearance and PvP start require user recheck on the new Preview.

Production: NOT EXECUTED. Production DB/data/deployments unchanged. No assertion of full Production DB/Edge/env/flag equivalence.
