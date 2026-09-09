# Card Visual System — Gate 2

Integration base: `edb560c1b30bbbbd035622b5e35fff5f32eab7bf`.
Design authority: normalized TOKYO NIGHT STREET delivery, 22 designs / 26 RGBA PNG. Every runtime SHA-256 matches `gate2-production-metadata.json`.

## Implementation

| Area | Change / preservation |
|---|---|
| Runtime assets | Exactly 26 existing rarity PNG paths replaced. Character alpha geometry identical across four rarities; four Skill/Equipment pairs byte-identical. |
| Character | Native 5:7 frame layout; common opening inset; contain rendering; no static rarity border, light or glow layered over the PNG. Selection / leader / NEW remain separate. |
| Item | Removed Equipment N translate/scale compensation and static tier border/glow. Shared PNG frame geometry; item art uses contain. |
| Progression | Character Awakening remains PNG. Skill/Equipment result progression uses one text style for +1 through +10. Removed item level-dependent decorative tiers. DB values unchanged. |
| Compact circles | BattleUnitPortrait and UserIdentityRow suppress the portrait frame, retaining the existing outer/state/attribute presentation for readability. |
| Gacha | CharacterGachaPresentation unchanged. No portrait frame or old Reveal added to new reveal/summary. Item result glow/glint disabled. All old Character Reveal CSS preserved. |
| Authority boundaries | GameContext, DB, Master, rarityAssets resolver, gameplay/economy, Raid logic and Battle logic unchanged. Old Reveal four PNG and public/frames unchanged. |

## Validation and scope

- `node scripts/verify_card_visual_system.mjs`: PASS (26 exact hashes, dimensions/RGBA/transparency, identical Character alpha, shared item pairs, preservation allowlist, old Reveal CSS).
- `npm run typecheck`, production build and changed TSX lint: PASS. Local build uses preview/mock with Raid room UI enabled.
- Raid regression: 255 PASS. Party draft and initial Equipment: 10 PASS. Existing Gacha, Tutorial Character parity and Battle presentation contracts: PASS.
- Mobile browser coverage: Character HOME/list/detail/Growth/Awakening, skill set/detail/list, Equipment list/stage/detail, Party selection; 390x844 and 412x915 screenshots in `outputs/card-visual-gate2/local`.
- Same-art four-rarity geometry assertions and +1..+10 identical text styling pass at both widths. No extra Awakening image in item results.
- Browser Gacha coverage includes Character 1/10, Tutorial 10, Skill/Equipment 1/10, NEW/duplicate/awakening, transitions, Skip and summary; current Character presentation retained.
- Raid-enabled test setup explicitly supplies the existing empty Raid recovery fixture. Tutorial reload setup re-seeds it after localStorage.clear; real recovery code is unchanged.

## Existing failures (not introduced here)

Gate 1 documented two Tutorial selector failures: first-quest old `.character-presentation-thumbnail` assertion and desktop old `.battle-roster-stage` assertion. They remain excluded from the focused run, not silently fixed.

The old final-asset checker also rejects `/qa-missing-image.png` and `/qa-missing-background.png`, deliberately invalid failure-test fixtures. The same failure was reproduced at the clean Raid baseline. Only its obsolete requirement for Equipment N scale(1.319) was updated to prohibit that correction.

## Preview

Preview deployment evidence and actual Preview screenshots will be recorded separately after deployment. Build uses the existing isolated Preview backend, mock=false, Raid UI=true. No Production deploy or alias change is authorized. Fixture-based result/replay QA does not claim paid draws or battle writes against the backend.

## Impact

DB / Master / acquisition rates / prices / pity / consumption / reward logic: NONE. Existing operator asset paths and kind mappings retained. UI impact is intentional and limited to Card Visual rendering. Human visual approval remains a Preview review step.

Final focused browser result: 93 distinct cases PASS (92 in the broad run, 1 Tutorial random-SSR/reload case rerun after correcting only the Raid recovery fixture). Two Gate 1 known selector failures excluded. No remaining new failure.
