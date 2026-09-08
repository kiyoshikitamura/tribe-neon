# FIX presentation integration — 2026-09-08

## Scope / release boundary

- Character gacha: CommonModals already routes all CHARACTER-only results through CharacterGachaPresentation, for both tutorial and ordinary pulls. The tutorial flag only changes the completion journey. Skill/equipment gacha stays separate.
- PATROL, PVP, PVP_PRACTICE and GVG: shared setup, VS, playing and Result views.
- RAID: existing setup, playing, Result and default timing retained. No raid gameplay, database or master changes.
- Production is NOT deployed or merged. Gacha and battle remain one coordinated release.
- FIX QA mocks remain unchanged. `/qa/battle-live` uses production CardBattleView with a deterministic canonical-master replay fixture; it does not charge resources, grant rewards or modify user progress.

## Live data contracts

- StreetBattleViewer consumes actionPresentation target groups and current participant projections; no random calculation, target selection or status-duration decrement in the view.
- Every target in a group gets its own effect/number. HP damage uses hpDamage, healing uses effectiveAmount, with amount fallbacks. Zero damage/heal, misses, critical and shield absorption remain distinguishable.
- Character master rarity controls the cast: SSR full standing art (opacity 1), other rarities face + name. Skill ID resolves independently against CANONICAL_SKILL_VIEW for SR/SSR supplemental image effects. Unknown skill IDs do not invent a skill rarity.
- Persistent statuses and detail dialogs use activeEffects and their remainingDuration/amount, with existing legacy fallbacks. Three badges + overflow. No fixed mock durations/amounts.
- Original HP projection trace hook, DOM IDs, data attributes and HP-track sampling retained in BattleUnitPortrait.
- Opt-in street timing has 800ms non-SSR / 1200ms SSR minimum cast recognition, at least 495ms impact and 900ms post-impact number visibility at 2x/3x. Raid default timing remains unchanged.
- Setup waits for participating art, backgrounds, rarity/attribute badges, textures and live fonts; retry on failure. PATROL tactic remains read-only. PVP preparation confirmation, cancellation and launch callbacks retained.
- Result uses the existing analyzeBattleResult algorithm, actual mode stats/rewards, pending-reward gate and onContinue. No new settlement API.
- Live font subset is separate from FIX mock fonts and includes source/master glyphs. Build script and existing Apache-2.0 license retained.

## Verification

- Production-mode Next build with preview/mock environment.
- `node --experimental-strip-types scripts/verify_street_battle_integration.mjs`: routing, independent rarity conditions, 1x/2x/3x holds, all-target projection, zero heal, crop/opacity, reward gate.
- `npm run verify:battle-presentation`: deterministic replay, HP projection and legacy raid contracts.
- `npm run verify:battle-mvp-result`: damage/heal/shield MVP scoring.
- `npm run verify:character-gacha-quotes`: all 60 characters, original SSR quotes unchanged.
- Scoped ESLint and git diff whitespace checks.
- Headless Chromium at 390×844 and 320×568: live setup/detail, 1.6s VS, shared 5v5 replay, 2x SSR opacity, HP track/data parity, skip, Result, five-part MVP details, continue/reset. No page errors or horizontal overflow.

## Remaining release acceptance

- Real iPhone/Safari visual review of the integrated view (not only the frozen mock).
- Authenticated end-to-end normal gacha purchase/settlement, official PVP and quest reward/onboarding continuation on Preview. The local fixture cannot verify backend transactions.
- Release review and explicit Production authorization for the combined rollout.
