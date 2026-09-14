# Skill / Quest integration audit — 2026-09-14

Base: `661dfd3d4ed2de3ca0420185f18537be5e34baa9`.
Status: code prepared; migrations and authenticated Preview acceptance pending.
Production: no changes.

## Quest

The unapplied `20260914075032_quest_main_formation_authority.sql` replaced the
existing Preview RPC and accidentally omitted both Tutorial snapshot wrappers.
Read-only inspection of `sufvuqdnqohpfzkwxohq` confirmed those wrappers in the
current `create_patrol_battle_replay(uuid,text)` definition.

The migration now keeps `apply_tutorial_player_snapshot` around the authoritative
server snapshot and applies `apply_tutorial_enemy_snapshot` before creating the
replay. Saved Main Formation supplies the ordered character IDs; the expedition
character remains independent. Existing ownership, eligible encounter lock,
tactic validation, replay insertion and permissions remain intact.

## Skill terminology inventory

- Whole-repository exact search: `skillLevel`, `skill.level`, `Skill Lv`,
  `Skill Level`, `SKILL_LEVEL_*`, and Japanese skill-level terminology.
- No runtime `src` matches. Wider case-insensitive level/Lv searches reviewed:
  character/equipment levels and character awakening-dependent skill-slot count
  are valid. QA route `card-visual-skill-levels` already labels its visual test
  `Skill +1 to +10`; it is a stable test identifier, not a displayed Skill Lv.
- CharacterSystemV2 skill list, detail, equipped slots and growth use `plus_val`.
  Shared asset list renders Lv only when `kind === "equipment"`.
- Historical migrations, recorded SQL catalogs and audit instructions retain old
  terminology as history. They are not rewritten.
- Preview has no `user_skills.level` column.
- One live legacy mission: `GVG_PREP_02`, target 5,
  `SKILL_LEVEL_TOTAL_INCREASE`, description `開催期間中にスキルレベルを合計5上昇`.

CLI 2.117.0 generated
`20260914110224_skill_enhancement_mission_terminology.sql`. It updates only that
mission's trigger and two description columns, preserving ID, target, event,
rewards, user progress and claim status. Canonical trigger: `SKILL_ENHANCE_COUNT`.
Current Preview `evaluate_mission_progress` already maps `SKILL_LIMIT_BREAK` to
this trigger. Legacy aliases are retained to avoid breaking historical callers.

Read-only preflight: 95 existing `GVG_PREP_02` user rows. Their ordered row checksum
was `edcc2047b0471d94159daad729db28cb` at audit time; rebaseline immediately before
application if users have progressed since then. The migration never modifies
`user_missions`.

## Verification

- `git diff --check`: PASS.
- `node --experimental-strip-types scripts/verify_canonical_missions.mjs`: PASS,
  37 canonical missions.
- `node --experimental-strip-types scripts/verify_battle_full_skill_load_fixture.mjs`:
  PASS, patterns A–I and Quest background parity.
- `DB_TEST_RUNTIME_DIR=/workspace/scratch/5b493055e82c/db-test-runtime node scripts/test_quest_main_formation.mjs`:
  PASS in isolated PGlite. Actual Quest/Main Formation SQL and actual Tutorial
  wrapper definitions verify saved five-member order, changes between battles,
  explorer independence, authentication, empty-party atomic rollback, normal and
  completed Tutorial pass-through, first-unit skill cooldown 2 during Tutorial,
  and enemy HP halving with DEF and player stats preserved. Only the snapshot
  builder is a test double that records the selected characters.
- DB application, post-application progress comparison, Tutorial battle,
  saved five-character party across Quest/PvP/Raid and actual Skill UI: PENDING.
  Static checks are not real-device acceptance.
