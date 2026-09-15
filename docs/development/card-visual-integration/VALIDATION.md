# Gate 1 validation

Validation applies to the selected Character integration, before any Card Visual asset replacement. All browser journeys use the repository's local mock database; no remote DB mutation, migration, Edge deployment or Vercel deployment was performed.

| Check | Result | Evidence / qualification |
|---|---|---|
| Production alias metadata | CONFIRMED 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd | production-readback.json, authenticated GET only |
| Runtime diff allowlist | PASS | preservation-result.json; 8 Character files, Context outside handleSaveParty identical |
| Gacha / CommonModals | PASS | Three-way identical Production/Raid/Character blobs; browser result below |
| DB / Master / public assets | UNCHANGED | Git diff from Raid is empty for these paths |
| Build | PASS | NEXT_PUBLIC_USE_MOCK_DB=true; final local QA build also NEXT_PUBLIC_APP_ENV=preview |
| Typecheck | PASS | npm run typecheck; build TypeScript also passes |
| Changed Character TSX lint | PASS, 0 errors | eslint --quiet, four Character components |
| Party draft contract | 2 PASS | Failed save keeps Context; successful save publishes after persistence; legacy no-argument call supported |
| Initial equipment contract | 8 PASS | Actual bootstrap block: persisted rows only, failure/partial/relogin/empty roster |
| Tutorial Character parity contract | PASS | 60 canonical characters, master-driven rarity |
| Gacha phase 6-B contract | PASS | Existing presentation/runtime contract |
| Battle presentation contract | PASS | Replay, effect projection, roster, tutorial skip, result retention |
| Battle TOP browser | 5 PASS | 390/412 viewport, Ready cancel, ranking/Raid/reload, failed portrait, server rejection |
| Character HOME browser | 8 PASS | 375/390/430, empty formation, no roster, stable selection, filtered switching |
| Remaining browser suite | 33 PASS / 2 existing FAIL | Character V2, Character/Quest, new Gacha and Tutorial completion; failure comparison below |
| Total distinct browser cases | 46 PASS / 2 existing FAIL | 48 selected cases; no new failure relative to Raid baseline |

## Raid suite

| Suite | PASS count |
|---|---:|
| Domain | 110 |
| Browser components | 29 |
| Detail | 16 |
| TOP | 16 |
| TOP data | 6 |
| Activity synchronization | 16 |
| Clear reward | 4 |
| useBattle room | 20 |
| Street presentation | 5 |
| Ranking retirement | 5 |
| UI cutover | 3 |
| Pages | 5 |
| Rescue hook | 3 |
| Pages data | 4 |
| Shared integration | 5 |
| Initial equipment | 8 |
| **Total** | **255** |

Setup measurement contract also PASS (no Node test-count output). The equipment 8 are included here and in the dedicated equipment row, not additional distinct cases.

Initial Raid execution lacked the external esbuild/JSDOM runtime. After providing isolated test dependencies, five assertions lacked ignored historical PostgreSQL fixture JSON. The exact five fixtures were copied from the existing stage-5 outputs and the affected three suites rerun successfully. See fixture-provenance.json for source paths/hashes. This validates current UI/parser behavior against captured data; it is NOT a fresh PostgreSQL/Preview DB parity test. No SQL was executed.

## Resolved test setup / selector failures

- Retaining the accepted inventory management navigation makes the label スキル appear in both management and Growth tabs. The imported browser test selector was scoped to the Growth navigation. Product behavior did not need a change; inventory access has its own passing regression test.
- Initial local build did not set NEXT_PUBLIC_APP_ENV=preview; QA harness intentionally returned 404. Rebuilt with the documented Preview setting, preserving Production's QA-route guard. Gacha tests then reached the real harness.
- Existing React `act` warnings and Node module-type warnings do not represent failed assertions. No unrelated code was changed to silence them.

Human visual acceptance is still pending. Gate 1 establishes a local source integration authority; Gate 2 asset/CSS changes and Gate 3 real Preview acceptance remain separate.

## Existing Tutorial test failures, reproduced on unmodified Raid

An isolated detached worktree `game03-card-integration-baseline` at exact 2d2d2b1563e92f1471f9c86fa8a7cc59040ec726 was installed and built with the same mock/Preview flags. Its working tree stayed clean. Both focused tests fail at the SAME line, selector and phase as the integration:

| Test | Raid baseline | Integration | Actual reached phase |
|---|---|---|---|
| `m9-tutorial.spec.ts:665` first quest dispatch/battle/reward | FAIL line 778, `.character-presentation-thumbnail` count 0 vs 1 under 出撃パーティ | Identical FAIL | B1, new 出撃準備 and member detail button are visible |
| `m9-tutorial.spec.ts:978` desktop battle action boundary | FAIL line 1011, `.battle-roster-stage` absent | Identical FAIL | B4, new battle party regions and HP cards are visible |

These old DOM assertions predate the retained Battle UX. They were not rewritten or used as a reason to revert Battle. The full fresh mobile first-session test, random SSR ownership/reload tests, tutorial formation/resume, growth gate/resume, new Gacha controls and result paths all PASS on the integration. Both old failures remain tracked; the complete existing test suite is not claimed green. Error summaries are in baseline-failure-comparison.json.
