# Gate 1: three-way comparison and selective adoption

Production: 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd
Raid base: 2d2d2b1563e92f1471f9c86fa8a7cc59040ec726
Character source: 91f7a7d937fbbf427bfbaada0547f38c244e9a11
Character delta ancestor already present in Raid: 1a38636a4d8d24ce948b1467f4da974cb17cdb3d

All source comparisons use frozen Git objects, never mutable working trees. Detailed blob identities are in three-way-blobs.json. Scope counts overlap and include domain/assets where names match.

| Feature | Production → Raid differing files | Raid → Character differing files | Integration decision / Must preserve |
|---|---:|---:|---|
| Character Gacha | 0 | 0 | Keep Raid implementation unchanged |
| Character HOME/list/detail | 5 | 7 | Only adopted hunks below; all other files remain Raid |
| Party | 0 | 2 | Only adopted hunks below; all other files remain Raid |
| Equipment | 0 | 2 | Only adopted hunks below; all other files remain Raid |
| Battle / PvP | 14 | 14 | Keep Raid implementation unchanged |
| Raid | 91 | 91 | Keep Raid implementation unchanged |
| Tutorial | 2 | 2 | Keep Raid implementation unchanged |
| Card Visual | 2 | 2 | Only adopted hunks below; all other files remain Raid |
| Quest | 1 | 1 | Keep Raid implementation unchanged |
| Guild / GvG | 0 | 0 | Keep Raid implementation unchanged |
| Ranking | 3 | 3 | Keep Raid implementation unchanged |
| Profile / Leader | 0 | 0 | Keep Raid implementation unchanged |
| Skill | 0 | 0 | Only adopted hunks below; all other files remain Raid |

## File / hunk adoption (declared before product edits)

| File | Adopt | Hold / reason |
|---|---|---|
| CharacterHome.tsx | Source labels and HOME actions | No visual asset change |
| CharacterEquipment.tsx / .css | Seven slots, canonical base/equipment stat breakdown, actual refresh feedback, existing auto-equipment handler | No new persistence or formula |
| CharacterParty.tsx / .css | Saved formation, local draft, cancel/confirm, leader selection, confirmation scroll | No new RPC or DB change |
| CharacterSystemV2.tsx | Leader HOME entry, list sorting, new Equipment/Party wiring; Growth Skill tabs as dependency of moving Skill slots out of Equipment; existing canonical Awakening preview; item detail return paths | HOLD removal of independent Skill/Equipment inventory, rarity/equipped filters and management navigation. Restore Raid blocks so accepted inventory access remains. |
| CharacterSystemV2.css | Growth tabs / readable Skill slot CSS needed by selected routes | No Card PNG/CSS cleanup in Gate 1 |
| GameContext.tsx | ONLY handleSaveParty optional draft, slice(0,5), publish Context after successful persistence | All Raid handlers, bootstrap equipment fix and other context hunks remain Raid |
| Character tests + draft unit contract | Only corresponding test/selector adaptations, plus inventory preservation test | Do not import unrelated tests or deployment scripts |

No merge or wholesale cherry-pick of Character history. All unlisted runtime files, public assets, constants, canonical data, Supabase files, Gacha, Battle and Raid are retained byte-for-byte from Raid. Human visual acceptance remains pending; this is a technical integration candidate, not a claim of acceptance.

## Preserved UX authority

Production new CharacterGachaPresentation and CommonModals must remain at Production blobs. Raid Battle additions remain at Raid blobs, not reset to Production. Raid stages 5/6 deployment/DB preparation are not rerun. Tutorial product code remains Raid. New HOME/Equipment/Party source is selectively applied with inventory removal held. Existing production economy, Gacha probabilities, Master, DB are untouched.

### Implementation comparison

| Area | Production 550c022 | Raid 2d2d2b1 | Character 91f7a7d | Integrated selection |
|---|---|---|---|---|
| Character Gacha | CharacterGachaPresentation arrival/reveal/summary, no dedicated Reveal frame | Identical Gacha/CommonModals blobs | Identical blobs | Keep Production through Raid; no added frames |
| Character HOME / list / detail | Earlier Character System presentation | Includes CharacterHome and persisted-equipment fix from 1a38636 | Leader-first HOME, secondary sorted list, explicit growth/equipment/party routes | Adopt new entry/selection/wiring; CharacterPresentation itself stays Raid |
| Party | Earlier inline management | Existing inline Party and canonical persistence | Separate Party HOME/member/leader views; draft until explicit confirmation | Adopt CharacterParty + optional-draft save hunk; preserve all other Context behavior |
| Equipment | Existing loadout/detail/growth | Same underlying handlers plus phantom-equipment fix | Seven-slot stage, base/equipment contribution, refresh feedback | Adopt renderer/CSS and detail wiring; keep independent inventory/filter UX |
| Skill | Existing slots + standalone filtered inventory | Same canonical handlers | Slots move into Growth tabs; standalone inventory removed | Adopt slot relocation dependency and readable CSS; HOLD inventory/filter removal |
| Battle / PvP | Accepted new Battle TOP/PvP | PvP blobs identical; shared Battle components support Raid lifecycle | Character source lacks Raid-specific shared changes | Keep entire Raid Battle tree; never copy Character Battle files |
| Raid | Earlier implementation | Stage 5/6 fixed candidate, room/top/pages/rescue/reward/result support | Lacks later Raid implementation | Keep Raid tree and all Context Raid handlers; no SQL/Edge/deployment action |
| Tutorial | Current Production tutorial/gacha journey | Existing Raid-side differences already present | Character source test selectors adapted; no new Tutorial product change | Keep Raid Tutorial product code; test selector-only adaptations |
| rarityAssets / CardIcon / CharacterPresentation | Current mappings/renderers/assets | Unchanged relevant canonical mappings | Unchanged; only CharacterSystemV2 wrapping/routes change | No mapping or assets replaced; renderer/CSS integration follows Gate 2 |
| Quest / Guild / Ranking / Profile / Header | Production UX | Raid links/activity/ranking integration where applicable | Would drop Raid integration if copied wholesale | All retained from Raid; Context outside save hunk identical |

### Repository isolation

Origin: https://github.com/kiyoshikitamura/tribe-neon.git. Integration uses a new worktree at `game03-card-visual-integration`, branch `codex/card-visual-integration-base-20260909`, initial HEAD 2d2d2b1563e92f1471f9c86fa8a7cc59040ec726, initially clean.

Character source worktree was clean at branch `codex/character-ux-v2-20260909`, HEAD 91f7a7d937fbbf427bfbaada0547f38c244e9a11. Raid sibling is being used by separate work: latest observed branch `codex/raid-step6-supplement-20260909`, HEAD b8ad912782f49fb6a58eef4f12b0cea95856e4f0, untracked supplement reports/scripts and outputs. None were copied or modified. `2d2d2b1..b8ad912 -- src public supabase` is empty; the stage-6 report commit adds evidence only. Frozen objects, not the sibling working tree, define this integration.

### Preservation risk and held scope

Human visual acceptance of new Character screens remains pending. This local integration does not publish them. The source's standalone inventory removal is intentionally held to prevent loss of accepted access. Growth/Skill tabs are adopted as a dependency of the new Equipment separation, using unchanged canonical calculations and mutation handlers. Unlisted Character branch differences and all unrelated source history are excluded. Raid supplement work remains separately owned and unintegrated. Existing starter-equipment permission failures are not repaired through DB changes here.

## Production readback

2026-09-09T06:51:49.050Z authenticated Vercel alias/deployment metadata: www.tribe-neon.com → dpl_A53gBsmTqXXBiUVDpXwQxpigJJMx; READY Production; https://tribe-neon-nfmjnrpd8-kiyoshi-kitamura.vercel.app; githubCommitSha/gitCommitSha 550c02225cbecb6ba6f174ee3fb952bcaae2f6dd; branch codex/production-base-battle-top-20260909.

## Status

INTEGRATION CANDIDATE: VALIDATED; the containing integration commit is the new authority (single parent: frozen Raid SHA above).
SAFE TO IMPLEMENT CARD ASSETS AFTER INTEGRATION COMMIT: YES

Typecheck/build PASS. Selected browser tests 46 PASS / 2 existing Battle-selector FAIL, both reproduced on an unmodified Raid worktree. Raid local regressions 255 PASS, Party draft 2 PASS. No new regression found. See VALIDATION.md for scope and limits. Card Asset replacement has NOT started. No deploy or remote push was performed.
