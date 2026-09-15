# Character STEP 2 — Production base synchronization

## Live authority confirmed before changes
- Domain: https://www.tribe-neon.com/
- Vercel alias API /v4/aliases/www.tribe-neon.com resolves dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx.
- Deployment API /v13/deployments/dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx: production, READY, githubCommitSha550c02225cbecb6ba6f174ee3fb952bcaae2f6dd, githubCommitRef codex/production-base-battle-top-20260909.
- Deployment created: 2026-09-09 08:58:44 JST; ready08:59:16; domain alias updated09:00:17.
- Git remote origin https://github.com/kiyoshikitamura/tribe-neon.git fetched; remote branch resolves exact SHA; initial working tree clean.
- Production parent3bdefedd9b49fbbadac5ca2bbc832fe10c1b9716 includes accepted eff2f35 Setup/Gacha/Battle/Result/mobile recovery. Those product paths are byte-identical to eff2f35. PvP TOP is added by550c022.
- No assumption that main or previous Character integration is current Production.

## A/B/C/D difference audit
A: Character STEP 2 commit4b9ecf78b9d6c80cbec6a326297eed707f29cb9c adds CharacterHome.tsx/.css and characterHomeSelection.ts, modifies CharacterSystemV2.tsx/.css, and updates Character tests. Prior baseafb0ca4 and Production550c022 are identical on these existing product/test paths, with no new-file collision.
B: SetupView, Gacha Presentation including dependencies, and OutlawButton from a02754c are already equivalent in Production. Do not reapply the previous normalization commit.
C: Production controls Context, Battle/Result, PvP, Raid, Quest, Tutorial canonical code, shared CSS/font/button and all DB/RPC authority. Old branch Raid Room/rescue was parallel unshipped work, not current Production; it is not carried forward. Likewise do not import fca0afc or other later-looking candidate branches without a live alias match.
D: Three-tree simulation with STEP 2 parentafb0ca4 / target550c022 / source4b9ecf7 finds zero textual conflicts. No merge or cherry-pick of the old integration branch.

## Implementation
New branch codex/character-production-sync-20260909 starts at exact Production550c022. Only five Character product files and two associated test files are transferred from4b9ecf7. This document is the eighth changed file.
Preserved: LIST/card power, LIST→HOME, full-body presentation, rarity/name/level/awakening/power, primary育成する, secondaryEquipment/PARTY, arrows/gesture, existing growth/equipment/party destinations, initialCharacterMasterId.
Existing getCharacterTotalStats HP+ATK+DEF reused; equipment count matches owned instance UUID; saved Main Formation uses existing get_current_main_formation read RPC. No new authority or persistent state.
Production CharacterTab Tutorial branch, getCharacterTotalStats utility, GameContext, all Battle/Result/PvP/Raid/Quest and supabase files have zero changes.

## Validation
Mock build PASS. Generated .next from old branch was moved outside repository after deletion was denied by automatic approval review; no product configuration workaround.
Changed-file lint0 errors/52 warnings. Battle presentation/MVP Result/PvP R8/Raid activation contracts PASS.
Typecheck PASS. Chromium browser suite39 PASS (Character, Setup, Gacha, Battle/Result, PvP TOP, Raid and Quest). WebKit10 PASS including Character375/390/430, HOME390x667, Battle320x568, Setup/Gacha. Real Preview verification is recorded in the delivery acceptance report after deployment.
DB migration0, schema change0, RPC addition0, gameplay rule change0, Production deploy0, main merge0.
