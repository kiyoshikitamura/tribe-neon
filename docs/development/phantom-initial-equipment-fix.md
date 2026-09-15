# Phantom initial equipment state

Base0ef8a56775c3878e4856176fb8c2d157f59d8a6d (verified Production550c022 plus Character STEP2).

## Root cause / affected paths
syncBootstrapData (GameContext) reads user_equipments. On an empty result and an owned Character, it builds five existing starter grant requests for slots0/2/3/4/5. Previously, insert().select().maybeSingle() failure still pushed a locally generated id/row into seeded. seeded became userEquipmentsList and selectedEquipment. Thus a denied grant was indistinguishable from persisted equipment in shared client state.
Reload/login invokes bootstrap again, reproducing phantom rows while DB remains empty. Progression/equipment refresh paths also invoke bootstrap.

| Path | Effect before fix |
| --- | --- |
| Character LIST/HOME | getCharacterTotalStats(record,userEquipmentsList) includes phantom bonuses; HOME count also includes them |
| Growth | CharacterSystemV2 after-level preview and useCharacterProgression powerBefore/powerAfter include the same list |
| Equipment | Fake owned entries, selected item, levels/options and equip/upgrade targets |
| Party | V2 displayed party sum and initial local auto-formation ordering affected |
| Saved Party/power | get_current_main_formation/get_my_power_snapshot remain server-owned; save_recommended_main_formation and complete_current_tutorial_formation supply canonical committed members |
| Battle/Raid preparation | useBattle seeds initialPlayerParty from Context equipment; missing-roster fallback fetches DB equipment, otherwise phantom data can affect preparation |
| Official battle/rewards | PVP/RAID/QUEST canonical replay snapshots replace initial participants before official playback. Official outcome/reward authority remains server-owned. No claim that every preparation value was immune |
| Profile of another player | Separate equipment DB fetch; does not use this list |

## Minimal fix
Only the equipment projection block in GameContext changes. Existing five grant requests, equipment identities, slots, options and initial-grant trigger remain unchanged.
Only a non-error DB insert response is accepted. No synthetic owned row is created on failure. After the grant attempt, project fetched/returned persisted rows and select an existing returned item; empty rows clear selection, level/LB display and options. Partial success retains only successful records. Existing nonempty DB fetches do not grant again and replace stale selection if necessary.
No UI filtering hack, calculation edit, new RPC, schema/migration, grant/RLS change or bootstrap-wide refactor.

## Verification
scripts/verify_initial_equipment_state.mjs executes the actual TypeScript equipment bootstrap block with controlled DB responses.8 scenarios PASS after fix;7 fail against base0ef8a56. Includes all-success fresh grants, rejection, partial success, null return, error+data, no Character, repeated failure and persisted reload.
Fresh full Tutorial browser test additionally checks5 DB adapter rows and HOME canonical power/count for their actual owner, after AUTO_FORMATION and Tutorial completion.
Typecheck/build PASS; Context lint0 errors. Battle MVP/PvP R8/Raid activation contracts PASS. Browser/live results supplied in acceptance report.

Live grant permissions are not changed: this fixes state after a failed grant, not a DB refusal to grant. Real Fresh User persistence success must be reported independently from isolated success coverage.

Browser validation: Character/Party/Battle/PvP/Raid/Quest26 PASS; Tutorial formation/resume2 PASS; fresh full Tutorial including5 persisted starter rows and HOME canonical parity1 PASS. Fresh test old Battle DOM assertions were updated to current Production StreetBattle selectors; dedicated Battle/Result tests remain PASS.
