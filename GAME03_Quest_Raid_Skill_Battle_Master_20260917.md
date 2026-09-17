# GAME03 Quest + Raid Skill Battle Master — 2026-09-17

This repository-facing machine-readable authority is split into:

- `src/domain/gameplay/canonical/data/quest_encounters_20260917.json` — 21 Quest stages and five-member enemy loadouts.
- `src/domain/gameplay/canonical/data/raid_skill_battle_profiles_20260917.json` — 7 areas × 4 Raid difficulty profiles.

The loadout IDs are sourced from `src/domain/gameplay/canonical/data/skills_20260821.json`; only `SKILL_001` through `SKILL_050` are permitted. Rewards, Raid HP, economy, and existing progression contracts are outside this Master.

The source task specification defines the area grammar, recommended Power targets, and Good/Bad Skill acceptance comparison. The implementation script `scripts/apply_quest_raid_skill_battle_master_20260917.mjs` is deterministic and rejects any Skill outside the authorized range.
