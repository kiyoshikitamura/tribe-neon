# Character UX Brush-up V2

Base: 1a38636a4d8d24ce948b1467f4da974cb17cdb3d. Preview only; no Production deployment.

## Authority check
- Character statistics: getCharacterTotalStats(character, []) supplies unequipped stats; the same function with persisted Context equipment supplies equipped stats. The displayed equipment contribution is their difference for HP/ATK/DEF/SPD/LUK. Power remains HP+ATK+DEF.
- Initial HOME / first LIST card: existing identityLeaderCharacterId (users.favorite_character_id authority), if owned. Remaining cards use descending canonical Character power with ID tie breakers. Sorting is client-only. initialCharacterMasterId still overrides initial selection.
- Awakening: canonicalCharacterAwakeningRequired and applyCharacterAwakeningCopyEquivalent supply one-book progress and stage preview. canonicalSkillSlotCount supplies unlocked slots. No one-book-equals-one-stage assumption.
- Equipment: GEAR_SLOTS_MASTER seven slots; existing equip/unequip, Level/LB handlers; handleEquipGearBulkRecommended changes equipment only. Fixed effects come from canonical equipment compatibility master. Feedback compares actual Context values after refresh, not a predicted successful write.
- Party: get_current_main_formation supplies saved members, not the bootstrap display fallback. Candidate selection changes component-local draft only. handleSaveParty accepts an optional draft and calls the existing save_main_formation; Context members change only after success. Legacy no-argument behavior remains. Leader uses unchanged handleSetPartyLeader and favorite linkage. Auto Formation uses unchanged handleAutoFormation.

## UI
A: Character tab opens Leader HOME; explicit キャラ一覧 entry; filtered client sorting and switching.
B: Japanese HOME/operation labels; レベル / 覚醒 / スキル tabs; target Character remains identified. Skill equips/details/strengthening are in Growth.
C: CharacterEquipment component/CSS: full-body center, seven surrounding slots, white base stats + accent equipment contributions, real-delta feedback, equipment-only recommendation. Existing details and Level/LB retained in Equipment.
D: CharacterParty component/CSS: leader plus four members; member editor and leader selector are lower-level screens. No inventory/filter/save/equipment clutter in Party HOME. Draft preview, cancellation, and explicit confirmation.

## Protection
GameContext product diff only extends handleSaveParty with an optional draft. The persisted-only starter-equipment block from base is unchanged. No DB migration, schema change, new RPC, gameplay rule or canonical calculation changes. Setup/Tutorial/Gacha/Battle/Result/Raid/Quest/PvP product files unchanged. Test selectors follow the new normal Character IA; Tutorial canonical UI is untouched.

## Verification
Each A/B/C/D build passed before proceeding. Stage tests: A1, B2, C5, D6 PASS. Integrated Character/Party/Battle/PvP/Raid/Quest browser tests:32 PASS. Root equipment contract:8 PASS. Draft persistence contract:2 PASS (failure keeps committed state; success publishes after persistence; legacy no-argument save supported). Typecheck PASS; UI lint0 errors,53 warnings. Battle MVP, PvP R8 and Raid activation contracts PASS.

Final Tutorial, WebKit and real Preview screenshots/results are supplied in the workspace acceptance report. Real Preview uses an existing account; no equipment permission changes or privileged grants are part of this task.

Final validation: Tutorial formation/resume, full fresh Tutorial to normal HOME, and growth resume3 PASS. Low-height WebKit1 PASS. After screenshot review, skill slots use three columns/two rows and member confirmation sits directly below the power preview; rebuilt and reran all7 V2 browser cases PASS. Actual Preview existing-user authority checks PASS (leader Karen, Character power30,026, DB equipment0, Party81,082); final deployment evidence lives in the acceptance report.
