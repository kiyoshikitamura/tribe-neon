# Character HOME — STEP 2

Base: `afb0ca4fd3d2bec5216fa98e5e2ff3a12dec3e90` (`codex/raid-room-pc-preflight-20260908`).

## Scope

LIST selects a Character; HOME shows full-body art, rarity/name, current level/awakening and power, with one primary action (育成する) and Equipment / PARTY secondary actions. Arrows and horizontal gestures follow the current filtered roster. Existing Growth, LOADOUT and Party screens remain the destinations; their gameplay handlers and Tutorial branch are unchanged.

`CharacterSystemV2` accepts optional `initialCharacterMasterId` on mount for later external entry. `CharacterHome` also accepts the selected owned Character explicitly. No Gacha connection is added in STEP 2.

## Authority

- Character power: existing `getCharacterTotalStats`, then HP + ATK + DEF. No utility/master changes.
- Equipment count: owned instance UUID matches `equipped_character_id`; denominator comes from `GEAR_SLOTS_MASTER.length`.
- Party status: existing read RPC `get_current_main_formation`, independently of Context's fallback. Empty saved formation = 未編成; current Character in saved formation = 編成中; otherwise 編成外. Unresolved/error states are distinct and errors offer retry.
- Selection: Master ID (`character_id`, `upgradeSelectedCharId`), never owned UUID or persisted ordinal. Preserve selection after reorder; missing ID falls back to the current filtered first item. Empty/one-item rosters handled.

## Validation

- TypeScript: PASS.
- Changed-file ESLint: no errors (existing warnings retained).
- Next production build with existing Mock adapter: PASS.
- Chromium: Character HOME tests and updated Character/Quest presentation tests, 11 PASS.
- Existing post-Tutorial loadout guide: 2 PASS.
- Existing Tutorial formation-to-quest/resume and post-gacha growth resume: 2 PASS.
- Tutorial Character and Skill static parity scripts: PASS.
- WebKit mobile: 390px navigation/geometry and low-height/one-Character/empty-saved-formation: 2 PASS.
- 375/390/430 x 844: horizontal geometry, loaded contain image, primary/secondary actions above footer, arrow/gesture switching and destination entries PASS.
- 390 x 667: scroll reachability, one Character, long-name and 7-digit power stress checks PASS. Stress text is injected by tests only, not a product asset/master.
- Zero owned Characters, empty filters, full Canonical roster, filter-limited switching, identity after reorder/removal: PASS.

Screenshot: `evidence/character-home-step2/character-home-390.png` (local Mock-backed browser, actual Canonical Character/art/calculations).

## Limits / next steps

No live DB mutation testing; responsive evidence uses the existing isolated Mock adapter. STEP 3 growth/awakening/skill reorganization, Equipment-only auto-equip, Party draft editing and Gacha result integration are not implemented. Existing inner screens still mix responsibilities as recorded in STEP 1. Human acceptance remains required.

No migration, schema, canonical calculation, Tutorial source or RPC changes. No merge/cherry-pick.

## IMPLEMENTATION REGRESSION NOTES

Reference: `502c41f22d66a1d3df74db490e2a7284b925326b`.

A. CommonModals / CharacterGachaPresentation / useGacha / GameContext: untouched; external Gacha/Tutorial presentation differences remain unintegrated.
B. SetupView: untouched; Reference entry and safe-area changes remain unintegrated.
C. OutlawButton: untouched; Reference busy-label behavior remains unintegrated.

No overlap with Reference-only changed files. Existing CharacterPresentation, frame assets, design tokens and button implementation are reused.
