# Character STEP 2 Preview base normalization

Base: 4b9ecf78b9d6c80cbec6a326297eed707f29cb9c
Reference: 502c41f22d66a1d3df74db490e2a7284b925326b
Product hotfix: eff2f35491efb078cf6f6495dfadadc97f071063

## Scope and imported dependencies
- SetupView.tsx/.css: Reference World SKIP → AGEHA_INTRO → NAME_INPUT, timer guard, safe-area. Existing initialization stays unchanged.
- CommonModals.tsx: Reference CharacterGachaPresentation integration; old Character reveal and timer removed.
- components/gacha/CharacterGachaPresentation.tsx/.css, gachaStandingBounds.json: exact Reference presentation and standing framing.
- context/hooks/useGacha.ts: presentation category state.
- context/GameContext.tsx: only receive category state, set category inside existing draw-start flushSync, and expose category. No Reference replacement of the whole context.
- components/ui/OutlawButton.tsx: empty busy label fallback from Reference.
- domain/presentation/characterGachaQuotes.ts and data/character_gacha_quotes_20260908.json: all existing Character quotes from Reference.
- utils/acquisitionAttribution.ts, acquisitionAttributionMetadata.ts: Setup's existing observational telemetry dependency. Its existing RPC availability must be checked on Preview; no migration is included or applied.
- public/fonts/gacha-comparison/tetsubin.woff2, tetsubin-ReadMe.txt, Apache-2.0.txt, NOTICE.md: exact approved font and required attribution. Unused comparison fonts and unused alley image were not imported.
- Existing Character metadata, art, rarity badges, street backgrounds, useScreenReadiness, CharacterPresentation CSS and canonical master/stat utilities are unchanged and satisfy the remaining imports/assets. Unrelated promotion cache-busting was not imported.
- QA presentation harness: only the Reference gacha fixture/scenario; font comparison and unrelated Home/Battle changes excluded.
- Tests: Reference world-intro-skip and gacha-character-v3, Reference gacha expectations in m9-tutorial, extended responsive matrix and post-Tutorial Character HOME assertion.

## Preserved from base
Character STEP 2 directory, CharacterTab, initialCharacterMasterId contract, canonical stats utility, useBattle, Raid files and supabase tree are unchanged. GameContext changes are three presentation-only hunks. No schema, migration, gameplay rule, canonical Tutorial RPC, Production deployment or main integration.
Tutorial AUTO_FORMATION continues to select CharacterTab's existing tutorial UI. Normal CharacterSystemV2 is used only outside that step.

## Validation
- Product build (NEXT_PUBLIC_USE_MOCK_DB=true, NEXT_PUBLIC_APP_ENV=test): PASS.
- Typecheck: PASS. Product lint: 0 errors, 244 existing-style warnings.
- Chromium Setup/Gacha/Character: 21 PASS (initial responsive matrix).
- Tutorial gacha→formation, formation→quest/resume, visible growth/resume: 3 PASS.
- Raid activity sync: 14 PASS; actual useBattle Room integration: 17 PASS; UI cutover: 3 PASS.
- WebKit responsive selection: 12 PASS initially; 390px gacha horizontal-geometry assertion failed once, isolated rerun PASS (measured clientWidth/scrollWidth 390/390). This is retained as an intermittent validation limitation; no product change made to mask it.
- Responsive WebKit covers Setup 375/390/430 x844 and390x667; Gacha375/390/430x844 and320x568; HOME375/390/430x844 and390x667. Device emulation is not physical iPhone acceptance.
- Full isolated first session: PASS. Title → Setup → registration → new Gacha → AUTO_FORMATION growth/formation → Quest/Battle → rule guide → account save → dismiss Login Bonus → normal Character LIST → HOME. No DB state forcing was added for the final Character entry.

## Evidence
Setup390 and Gacha390 PNGs in evidence/character-preview-normalization are local Mock screenshots using actual canonical assets. Fresh HOME390 PNG was captured at the end of the full isolated journey. Live Preview verification follows deployment. No live PASS is implied by these local tests.
